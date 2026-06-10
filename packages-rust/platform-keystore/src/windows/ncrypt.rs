#![cfg(target_os = "windows")]

use crate::provider::KeyStorageProvider;
use crate::types::*;

use core::ffi::c_void;

use base64::{Engine as _, engine::general_purpose::STANDARD};
use windows::Win32::Foundation::{NTE_BAD_KEYSET, NTE_EXISTS};
use windows::Win32::Security::Cryptography::{
    BCRYPT_OAEP_PADDING_INFO, BCRYPT_SHA256_ALGORITHM, CERT_KEY_SPEC,
    NCRYPT_ALGORITHM_GROUP_PROPERTY, NCRYPT_ALLOW_EXPORT_FLAG, NCRYPT_ALLOW_PLAINTEXT_EXPORT_FLAG,
    NCRYPT_EXPORT_POLICY_PROPERTY, NCRYPT_FLAGS, NCRYPT_HANDLE, NCRYPT_KEY_HANDLE,
    NCRYPT_LENGTH_PROPERTY, NCRYPT_PAD_OAEP_FLAG, NCRYPT_PCP_TPM_MANUFACTURER_ID_PROPERTY,
    NCRYPT_PERSIST_FLAG, NCRYPT_PROV_HANDLE, NCryptCreatePersistedKey, NCryptDecrypt,
    NCryptDeleteKey, NCryptEncrypt, NCryptFinalizeKey, NCryptFreeObject, NCryptGetProperty,
    NCryptOpenKey, NCryptOpenStorageProvider, NCryptSetProperty,
};
use windows::Win32::Security::OBJECT_SECURITY_INFORMATION;
use windows::Win32::System::TpmBaseServices::{
    TPM_DEVICE_INFO, TPM_VERSION_12, TPM_VERSION_20, Tbsi_GetDeviceInfo,
};
use windows::core::PCWSTR;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Microsoft Platform Crypto Provider — routes key operations to the TPM.
const MS_PLATFORM_CRYPTO_PROVIDER: &str = "Microsoft Platform Crypto Provider";

// ---------------------------------------------------------------------------
// Provider handle wrapper — freed on drop
// ---------------------------------------------------------------------------

struct ProviderHandle(NCRYPT_PROV_HANDLE);

impl Drop for ProviderHandle {
    fn drop(&mut self) {
        if !self.0.is_invalid() {
            unsafe {
                let _ = NCryptFreeObject(NCRYPT_HANDLE(self.0.0));
            }
        }
    }
}

struct KeyHandle(NCRYPT_KEY_HANDLE);

impl Drop for KeyHandle {
    fn drop(&mut self) {
        if !self.0.is_invalid() {
            unsafe {
                let _ = NCryptFreeObject(NCRYPT_HANDLE(self.0.0));
            }
        }
    }
}

// ---------------------------------------------------------------------------
// TpmKeyStorage
// ---------------------------------------------------------------------------

pub struct TpmKeyStorage {
    // No persistent handle — open/close per operation to avoid stale handles
    // across sleep/resume cycles on kiosk hardware.
}

impl TpmKeyStorage {
    pub fn new() -> Result<Self, KeyStoreError> {
        // Verify the Platform KSP is loadable at construction time
        let _handle = Self::open_provider()?;
        Ok(Self {})
    }

    /// Open a handle to the Platform Crypto Provider.
    fn open_provider() -> Result<ProviderHandle, KeyStoreError> {
        let provider_name: Vec<u16> = MS_PLATFORM_CRYPTO_PROVIDER
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        let mut handle = NCRYPT_PROV_HANDLE::default();

        let status =
            unsafe { NCryptOpenStorageProvider(&mut handle, PCWSTR(provider_name.as_ptr()), 0) };

        if status.is_err() {
            return Err(KeyStoreError::ProviderUnavailable);
        }

        Ok(ProviderHandle(handle))
    }

    /// Open an existing key handle by name.
    fn open_key_handle(
        provider: &ProviderHandle,
        key_name: &str,
    ) -> Result<KeyHandle, KeyStoreError> {
        let name_wide: Vec<u16> = key_name.encode_utf16().chain(std::iter::once(0)).collect();

        let mut key_handle = NCRYPT_KEY_HANDLE::default();

        let status = unsafe {
            NCryptOpenKey(
                provider.0,
                &mut key_handle,
                PCWSTR(name_wide.as_ptr()),
                CERT_KEY_SPEC(0), // dwLegacyKeySpec
                NCRYPT_FLAGS(0),  // user-scoped (default)
            )
        };

        // Only NTE_BAD_KEYSET means "no key with this name". Anything else
        // (access denied, TPM busy, ...) is a real platform failure — mapping
        // it to KeyNotFound would make key_exists() report false for keys
        // that exist but errored.
        if let Err(e) = status {
            if e.code() == NTE_BAD_KEYSET {
                return Err(KeyStoreError::KeyNotFound(key_name.to_string()));
            }
            return Err(KeyStoreError::PlatformError(
                format!("NCryptOpenKey failed for '{key_name}'"),
                e.code().0,
            ));
        }

        Ok(KeyHandle(key_handle))
    }
}

impl KeyStorageProvider for TpmKeyStorage {
    fn status(&self) -> Result<ProviderStatus, KeyStoreError> {
        // Attempt to open the provider — if this succeeds, TPM KSP is functional
        let provider = Self::open_provider()?;

        // Both lookups are best-effort: a failure leaves the field None but the
        // provider is still reported as available.
        let tpm_version = query_tpm_version();

        let tpm_manufacturer = get_u32_property(
            NCRYPT_HANDLE(provider.0.0),
            NCRYPT_PCP_TPM_MANUFACTURER_ID_PROPERTY,
        )
        .ok()
        .map(|id| {
            // TPM_PT_MANUFACTURER packs 4 ASCII chars into a u32, MSB first.
            // Byte order assumed big-endian here — verify against hardware.
            let s = String::from_utf8_lossy(&id.to_be_bytes()).into_owned();
            s.trim_matches(|c: char| c == '\0' || c == ' ').to_string()
        })
        .filter(|s| !s.is_empty());

        Ok(ProviderStatus {
            available: true,
            backend: Some(Backend::NcryptTpm),
            tpm_version,
            tpm_manufacturer,
            message: "Microsoft Platform Crypto Provider loaded successfully".to_string(),
        })
    }

    fn create_key(&self, key_name: &str, exportable: bool) -> Result<KeyInfo, KeyStoreError> {
        if exportable {
            // Production guard: TPM keys must be non-exportable.
            // Dev backends may override this.
            return Err(KeyStoreError::ProvisioningFailed(
                "Exportable keys are not permitted with the TPM backend".to_string(),
            ));
        }

        // Check for existing key first
        if self.key_exists(key_name)? {
            return Err(KeyStoreError::KeyAlreadyExists(key_name.to_string()));
        }

        let provider = Self::open_provider()?;

        let name_wide: Vec<u16> = key_name.encode_utf16().chain(std::iter::once(0)).collect();

        // RSA-2048 for key wrapping. The DB password (~32 bytes) fits in a
        // single RSA-OAEP operation. AES keys in the TPM would require
        // symmetric encrypt which has different NCrypt semantics.
        let algo_wide: Vec<u16> = "RSA".encode_utf16().chain(std::iter::once(0)).collect();

        let mut key_handle = NCRYPT_KEY_HANDLE::default();

        let status = unsafe {
            NCryptCreatePersistedKey(
                provider.0,
                &mut key_handle,
                PCWSTR(algo_wide.as_ptr()),
                PCWSTR(name_wide.as_ptr()),
                CERT_KEY_SPEC(0), // dwLegacyKeySpec
                NCRYPT_FLAGS(0),  // user-scoped, non-exportable
            )
        };

        if let Err(e) = status {
            // The key_exists() precheck above is racy — a concurrent create
            // can land between it and here. NCrypt reports that as NTE_EXISTS
            // (no NCRYPT_OVERWRITE_KEY_FLAG passed); surface the same error
            // type the precheck would have.
            if e.code() == NTE_EXISTS {
                return Err(KeyStoreError::KeyAlreadyExists(key_name.to_string()));
            }
            return Err(KeyStoreError::ProvisioningFailed(format!(
                "NCryptCreatePersistedKey failed: {e:?}"
            )));
        }

        // Properties must be set on the unfinalized key. On failure, clean up the
        // partial key (mirrors the finalize-error path below).
        let h = NCRYPT_HANDLE(key_handle.0);

        // RSA-2048 key wrapping.
        if let Err(e) = unsafe {
            NCryptSetProperty(
                h,
                NCRYPT_LENGTH_PROPERTY,
                &2048u32.to_ne_bytes(),
                NCRYPT_FLAGS(0),
            )
        } {
            unsafe {
                let _ = NCryptDeleteKey(key_handle, 0);
            }
            return Err(KeyStoreError::ProvisioningFailed(format!(
                "set key length failed: {e:?}"
            )));
        }

        // Non-exportable: export policy = 0 (no NCRYPT_ALLOW_*_FLAG bits), persisted.
        if let Err(e) = unsafe {
            NCryptSetProperty(
                h,
                NCRYPT_EXPORT_POLICY_PROPERTY,
                &0u32.to_ne_bytes(),
                NCRYPT_PERSIST_FLAG,
            )
        } {
            unsafe {
                let _ = NCryptDeleteKey(key_handle, 0);
            }
            return Err(KeyStoreError::ProvisioningFailed(format!(
                "set export policy failed: {e:?}"
            )));
        }

        let finalize_status = unsafe { NCryptFinalizeKey(key_handle, NCRYPT_FLAGS(0)) };

        if finalize_status.is_err() {
            // Clean up the partial key
            unsafe {
                let _ = NCryptDeleteKey(key_handle, 0);
            }
            return Err(KeyStoreError::ProvisioningFailed(format!(
                "NCryptFinalizeKey failed: {:?}",
                finalize_status
            )));
        }

        // Free the handle — we open per-operation
        unsafe {
            let _ = NCryptFreeObject(NCRYPT_HANDLE(key_handle.0));
        }

        Ok(KeyInfo {
            name: key_name.to_string(),
            backend: Backend::NcryptTpm,
            exportable: false,
            algorithm: "RSA-2048".to_string(),
        })
    }

    fn open_key(&self, key_name: &str) -> Result<KeyInfo, KeyStoreError> {
        let provider = Self::open_provider()?;
        let key = Self::open_key_handle(&provider, key_name)?;
        let h = NCRYPT_HANDLE(key.0.0);

        let group = get_string_property(h, NCRYPT_ALGORITHM_GROUP_PROPERTY)
            .unwrap_or_else(|_| "RSA".to_string());
        let length = get_u32_property(h, NCRYPT_LENGTH_PROPERTY).unwrap_or(0);
        let policy = get_u32_property(h, NCRYPT_EXPORT_POLICY_PROPERTY).unwrap_or(0);

        let exportable =
            policy & (NCRYPT_ALLOW_EXPORT_FLAG | NCRYPT_ALLOW_PLAINTEXT_EXPORT_FLAG) != 0;
        let algorithm = if length > 0 {
            format!("{group}-{length}")
        } else {
            group
        };

        Ok(KeyInfo {
            name: key_name.to_string(),
            backend: Backend::NcryptTpm,
            exportable,
            algorithm,
        })
    }

    fn key_exists(&self, key_name: &str) -> Result<bool, KeyStoreError> {
        let provider = Self::open_provider()?;
        match Self::open_key_handle(&provider, key_name) {
            Ok(_) => Ok(true),
            Err(KeyStoreError::KeyNotFound(_)) => Ok(false),
            Err(e) => Err(e),
        }
    }

    fn seal(&self, key_name: &str, plaintext: SecretBytes) -> Result<SealedBlob, KeyStoreError> {
        let provider = Self::open_provider()?;
        let key = Self::open_key_handle(&provider, key_name)?;

        // OAEP padding info (SHA-256, no label). Must outlive the NCrypt calls.
        let padding = oaep_padding_info();
        let padding_ptr: *const c_void = (&padding as *const BCRYPT_OAEP_PADDING_INFO).cast();

        // Determine output buffer size
        let mut output_size: u32 = 0;

        let size_status = unsafe {
            NCryptEncrypt(
                key.0,
                Some(plaintext.as_slice()),
                Some(padding_ptr),
                None, // output buffer (null = query size)
                &mut output_size,
                NCRYPT_PAD_OAEP_FLAG,
            )
        };

        if size_status.is_err() {
            return Err(KeyStoreError::EncryptionFailed(format!(
                "NCryptEncrypt size query failed: {:?}",
                size_status
            )));
        }

        let mut ciphertext = vec![0u8; output_size as usize];
        let mut bytes_written: u32 = 0;

        let encrypt_status = unsafe {
            NCryptEncrypt(
                key.0,
                Some(plaintext.as_slice()),
                Some(padding_ptr),
                Some(&mut ciphertext),
                &mut bytes_written,
                NCRYPT_PAD_OAEP_FLAG,
            )
        };

        if encrypt_status.is_err() {
            return Err(KeyStoreError::EncryptionFailed(format!(
                "NCryptEncrypt failed: {:?}",
                encrypt_status
            )));
        }

        ciphertext.truncate(bytes_written as usize);

        // Base64 encode for safe JS transport
        let encoded = STANDARD.encode(&ciphertext);

        Ok(SealedBlob {
            ciphertext: encoded,
            key_name: key_name.to_string(),
            backend: Backend::NcryptTpm,
        })
    }

    fn unseal(&self, key_name: &str, blob: &SealedBlob) -> Result<SecretBytes, KeyStoreError> {
        let provider = Self::open_provider()?;
        let key = Self::open_key_handle(&provider, key_name)?;

        let ciphertext = STANDARD
            .decode(&blob.ciphertext)
            .map_err(|e| KeyStoreError::DecryptionFailed(format!("Invalid base64: {}", e)))?;

        // OAEP padding info (SHA-256, no label). Must outlive the NCrypt calls.
        let padding = oaep_padding_info();
        let padding_ptr: *const c_void = (&padding as *const BCRYPT_OAEP_PADDING_INFO).cast();

        // Determine output buffer size
        let mut output_size: u32 = 0;

        let size_status = unsafe {
            NCryptDecrypt(
                key.0,
                Some(&ciphertext),
                Some(padding_ptr),
                None,
                &mut output_size,
                NCRYPT_PAD_OAEP_FLAG,
            )
        };

        if size_status.is_err() {
            return Err(KeyStoreError::DecryptionFailed(format!(
                "NCryptDecrypt size query failed: {:?}",
                size_status
            )));
        }

        let mut plaintext = vec![0u8; output_size as usize];
        let mut bytes_written: u32 = 0;

        let decrypt_status = unsafe {
            NCryptDecrypt(
                key.0,
                Some(&ciphertext),
                Some(padding_ptr),
                Some(&mut plaintext),
                &mut bytes_written,
                NCRYPT_PAD_OAEP_FLAG,
            )
        };

        if decrypt_status.is_err() {
            return Err(KeyStoreError::DecryptionFailed(format!(
                "NCryptDecrypt failed: {:?}",
                decrypt_status
            )));
        }

        plaintext.truncate(bytes_written as usize);
        Ok(SecretBytes::new(plaintext))
    }

    fn delete_key(&self, key_name: &str) -> Result<(), KeyStoreError> {
        let provider = Self::open_provider()?;
        let key = Self::open_key_handle(&provider, key_name)?;

        // NCryptDeleteKey takes ownership of the handle — do NOT free after
        let status = unsafe { NCryptDeleteKey(key.0, 0) };

        // Prevent the Drop impl from double-freeing
        std::mem::forget(key);

        if let Err(e) = status {
            return Err(KeyStoreError::PlatformError(
                "NCryptDeleteKey failed".to_string(),
                e.code().0,
            ));
        }

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// OAEP padding info
// ---------------------------------------------------------------------------

/// Build the OAEP padding descriptor used for every RSA encrypt/decrypt:
/// SHA-256 hash, no label. `BCRYPT_SHA256_ALGORITHM` is a static wide string,
/// so the struct owns no heap data and is safe to copy by value.
fn oaep_padding_info() -> BCRYPT_OAEP_PADDING_INFO {
    BCRYPT_OAEP_PADDING_INFO {
        pszAlgId: BCRYPT_SHA256_ALGORITHM,
        pbLabel: std::ptr::null_mut(),
        cbLabel: 0,
    }
}

// ---------------------------------------------------------------------------
// Property helpers
// ---------------------------------------------------------------------------

/// Read a DWORD-valued NCrypt property from a key or provider handle.
fn get_u32_property(handle: NCRYPT_HANDLE, prop: PCWSTR) -> Result<u32, KeyStoreError> {
    let mut buf = [0u8; 4];
    let mut cb: u32 = 0;
    unsafe {
        NCryptGetProperty(
            handle,
            prop,
            Some(&mut buf),
            &mut cb,
            OBJECT_SECURITY_INFORMATION(0),
        )
    }
    .map_err(|e| {
        KeyStoreError::PlatformError("NCryptGetProperty failed".to_string(), e.code().0)
    })?;
    Ok(u32::from_ne_bytes(buf))
}

/// Read a NUL-terminated wide-string NCrypt property.
fn get_string_property(handle: NCRYPT_HANDLE, prop: PCWSTR) -> Result<String, KeyStoreError> {
    let mut cb: u32 = 0;
    unsafe { NCryptGetProperty(handle, prop, None, &mut cb, OBJECT_SECURITY_INFORMATION(0)) }
        .map_err(|e| {
            KeyStoreError::PlatformError(
                "NCryptGetProperty size query failed".to_string(),
                e.code().0,
            )
        })?;

    let mut buf = vec![0u8; cb as usize];
    unsafe {
        NCryptGetProperty(
            handle,
            prop,
            Some(&mut buf),
            &mut cb,
            OBJECT_SECURITY_INFORMATION(0),
        )
    }
    .map_err(|e| {
        KeyStoreError::PlatformError("NCryptGetProperty failed".to_string(), e.code().0)
    })?;

    let wide: Vec<u16> = buf[..cb as usize]
        .chunks_exact(2)
        .map(|c| u16::from_ne_bytes([c[0], c[1]]))
        .collect();
    let end = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
    Ok(String::from_utf16_lossy(&wide[..end]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::KeyStorageProvider;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// `Some(provider)` only when the Platform KSP is loadable — i.e. on a host
    /// with a TPM. CI Windows runners without a TPM hit `Err(ProviderUnavailable)`
    /// here, so each test early-returns and still passes.
    fn maybe_provider() -> Option<TpmKeyStorage> {
        TpmKeyStorage::new().ok()
    }

    fn unique_key_name(label: &str) -> String {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        format!("noem-rust-test-{}-{}-{}", label, std::process::id(), nanos)
    }

    #[test]
    fn status_reports_tpm_backend() {
        let Some(p) = maybe_provider() else { return };
        let s = p.status().unwrap();
        assert!(s.available);
        assert_eq!(s.backend, Some(Backend::NcryptTpm));
    }

    #[test]
    fn key_exists_false_for_missing() {
        let Some(p) = maybe_provider() else { return };
        assert!(!p.key_exists(&unique_key_name("missing")).unwrap());
    }

    #[test]
    fn create_seal_unseal_roundtrip() {
        let Some(p) = maybe_provider() else { return };
        let key = unique_key_name("roundtrip");

        // Inner closure so cleanup runs even when an assertion above fails.
        let result: std::result::Result<(), KeyStoreError> = (|| {
            p.create_key(&key, false)?;
            assert!(p.key_exists(&key)?);

            let blob = p.seal(&key, SecretBytes::new(b"correct-horse".to_vec()))?;
            assert_eq!(blob.key_name, key);
            assert_eq!(blob.backend, Backend::NcryptTpm);
            assert!(!blob.ciphertext.is_empty());

            let plain = p.unseal(&key, &blob)?;
            assert_eq!(plain.as_slice(), b"correct-horse");
            Ok(())
        })();

        let _ = p.delete_key(&key);
        result.unwrap();
    }

    #[test]
    fn create_key_rejects_exportable() {
        let Some(p) = maybe_provider() else { return };
        let err = p.create_key("noem-rust-test-exportable", true).unwrap_err();
        assert!(matches!(err, KeyStoreError::ProvisioningFailed(_)));
    }
}

/// Best-effort TPM version via TBS. Returns None if TBS is unavailable.
fn query_tpm_version() -> Option<String> {
    let mut info = TPM_DEVICE_INFO::default();
    let rc = unsafe {
        Tbsi_GetDeviceInfo(
            core::mem::size_of::<TPM_DEVICE_INFO>() as u32,
            (&mut info as *mut TPM_DEVICE_INFO).cast(),
        )
    };
    if rc != 0 {
        // non-zero == TBS error (TBS_SUCCESS is 0)
        return None;
    }
    match info.tpmVersion {
        TPM_VERSION_20 => Some("2.0".to_string()),
        TPM_VERSION_12 => Some("1.2".to_string()),
        _ => None,
    }
}
