#![cfg(target_os = "windows")]

use crate::provider::KeyStorageProvider;
use crate::types::*;

use core::ffi::c_void;

use base64::{Engine as _, engine::general_purpose::STANDARD};
use windows::Win32::Security::Cryptography::{
    BCRYPT_OAEP_PADDING_INFO, BCRYPT_SHA256_ALGORITHM, CERT_KEY_SPEC, NCRYPT_FLAGS, NCRYPT_HANDLE,
    NCRYPT_KEY_HANDLE, NCRYPT_PAD_OAEP_FLAG, NCRYPT_PROV_HANDLE, NCryptCreatePersistedKey,
    NCryptDecrypt, NCryptDeleteKey, NCryptEncrypt, NCryptFinalizeKey, NCryptFreeObject,
    NCryptOpenKey, NCryptOpenStorageProvider,
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

        if status.is_err() {
            return Err(KeyStoreError::KeyNotFound(key_name.to_string()));
        }

        Ok(KeyHandle(key_handle))
    }
}

impl KeyStorageProvider for TpmKeyStorage {
    fn status(&self) -> Result<ProviderStatus, KeyStoreError> {
        // Attempt to open the provider — if this succeeds, TPM KSP is functional
        let _provider = Self::open_provider()?;

        // TODO: Query TPM version and manufacturer via NCryptGetProperty
        // on the provider handle (NCRYPT_PCP_PLATFORM_TYPE_PROPERTY, etc.)

        Ok(ProviderStatus {
            available: true,
            backend: Backend::NcryptTpm,
            tpm_version: None,      // TODO: populate from TPM properties
            tpm_manufacturer: None, // TODO: populate from TPM properties
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

        if status.is_err() {
            return Err(KeyStoreError::ProvisioningFailed(format!(
                "NCryptCreatePersistedKey failed: {:?}",
                status
            )));
        }

        // TODO: Set key length property to 2048 via NCryptSetProperty
        // TODO: Set NCRYPT_EXPORT_POLICY_PROPERTY to 0 (non-exportable)

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
            backend: "ncrypt_tpm".to_string(),
            exportable: false,
            algorithm: "RSA-2048".to_string(),
        })
    }

    fn open_key(&self, key_name: &str) -> Result<KeyInfo, KeyStoreError> {
        let provider = Self::open_provider()?;
        let _key = Self::open_key_handle(&provider, key_name)?;

        // TODO: Read actual properties (algorithm, length, export policy)
        // via NCryptGetProperty

        Ok(KeyInfo {
            name: key_name.to_string(),
            backend: "ncrypt_tpm".to_string(),
            exportable: false,
            algorithm: "RSA-2048".to_string(),
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
            backend: "ncrypt_tpm".to_string(),
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
                e.code().0 as u32,
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
