#![cfg(target_os = "macos")]

// ---------------------------------------------------------------------------
// EnclaveKeyStorage — macOS Secure Enclave provider
//
// EC-P256 keypair generated inside the Secure Enclave, persisted via a
// Keychain item (the only way SE keys can be addressed across launches).
// Seal/unseal uses ECIES (X9.63-KDF SHA-256 + AES-GCM) via
// SecKeyCreateEncryptedData / SecKeyCreateDecryptedData. The caller stores
// the returned base64 ciphertext wherever they like — mirrors the Windows
// TPM model where the key lives in hardware and ciphertext goes to the caller.
//
// Apple Silicon only: status() and new() probe SE availability via the
// access-control flag kSecAccessControlPrivateKeyUsage, which is unsupported
// on Intel Macs without a T2 chip. Those hosts get ProviderUnavailable.
// ---------------------------------------------------------------------------

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use core_foundation::base::{CFTypeRef, TCFType, ToVoid};
use core_foundation::boolean::CFBoolean;
use core_foundation::data::CFData;
use core_foundation::dictionary::{CFDictionary, CFMutableDictionary};
use core_foundation::error::{CFError, CFErrorRef};
use core_foundation::number::CFNumber;
use core_foundation::string::{CFString, CFStringRef};
use security_framework::access_control::{ProtectionMode, SecAccessControl};
use security_framework::base::Error as SfError;
use security_framework::key::{Algorithm, SecKey};
use security_framework_sys::access_control::kSecAccessControlPrivateKeyUsage;
use security_framework_sys::base::{SecKeyRef, errSecItemNotFound, errSecSuccess};
use security_framework_sys::item::{
    kSecAttrAccessControl, kSecAttrIsPermanent, kSecAttrKeySizeInBits, kSecAttrKeyType,
    kSecAttrKeyTypeECSECPrimeRandom, kSecAttrLabel, kSecAttrTokenID, kSecAttrTokenIDSecureEnclave,
    kSecClass, kSecClassKey, kSecPrivateKeyAttrs, kSecReturnRef,
};
use security_framework_sys::key::SecKeyCreateRandomKey;
use security_framework_sys::keychain_item::SecItemCopyMatching;
use std::ptr;

use crate::provider::KeyStorageProvider;
use crate::types::*;

// security-framework-sys 2.17 doesn't re-export kSecAttrApplicationTag.
// Declare it ourselves so we can identify SE keys by an opaque CFData tag
// (Apple's canonical lookup attribute for hardware keys).
unsafe extern "C" {
    static kSecAttrApplicationTag: CFStringRef;
}

const TAG_PREFIX: &str = "com.noem.platform-keystore.";
const ALGORITHM_LABEL: &str = "EC-P256-SE";
const STATUS_MESSAGE: &str = "macOS Secure Enclave provider ready";
// Variable-IV ECIES with SHA-256 KDF and AES-GCM authenticated encryption.
// Matches Apple's recommended "encrypt with an EC public key" algorithm for
// SE keys (see SecKeyAlgorithm reference).
const ECIES_ALGO: Algorithm = Algorithm::ECIESEncryptionCofactorVariableIVX963SHA256AESGCM;

pub struct EnclaveKeyStorage;

impl EnclaveKeyStorage {
    pub fn new() -> Result<Self, KeyStoreError> {
        // Probe SE: SecAccessControlCreateWithFlags with
        // kSecAccessControlPrivateKeyUsage fails on hardware without a
        // Secure Enclave. Treat that as ProviderUnavailable.
        let _ = se_access_control()?;
        Ok(Self)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn se_access_control() -> Result<SecAccessControl, KeyStoreError> {
    SecAccessControl::create_with_protection(
        Some(ProtectionMode::AccessibleAfterFirstUnlockThisDeviceOnly),
        kSecAccessControlPrivateKeyUsage,
    )
    .map_err(|_| KeyStoreError::ProviderUnavailable)
}

fn tag_for(key_name: &str) -> Vec<u8> {
    format!("{TAG_PREFIX}{key_name}").into_bytes()
}

fn cf_err_text(e: &CFError) -> String {
    e.description().to_string()
}

fn cf_to_provisioning(e: CFError) -> KeyStoreError {
    KeyStoreError::ProvisioningFailed(cf_err_text(&e))
}

fn cf_to_encryption(e: CFError) -> KeyStoreError {
    KeyStoreError::EncryptionFailed(cf_err_text(&e))
}

fn cf_to_decryption(e: CFError) -> KeyStoreError {
    KeyStoreError::DecryptionFailed(cf_err_text(&e))
}

/// Build a SecItemCopyMatching query dictionary scoped to the SE private key
/// identified by `tag` in the data-protection keychain. When `return_ref` is
/// true the result holds the SecKeyRef; otherwise the call is an existence
/// probe (status alone).
fn lookup_query(tag: &[u8], return_ref: bool) -> CFDictionary {
    let tag_data = CFData::from_buffer(tag);
    let class_key = unsafe { CFString::wrap_under_get_rule(kSecClassKey) };
    let key_type = unsafe { CFString::wrap_under_get_rule(kSecAttrKeyTypeECSECPrimeRandom) };
    let token = unsafe { CFString::wrap_under_get_rule(kSecAttrTokenIDSecureEnclave) };
    let yes = CFBoolean::true_value();

    let mut pairs = vec![
        (unsafe { kSecClass }.to_void(), class_key.to_void()),
        (unsafe { kSecAttrKeyType }.to_void(), key_type.to_void()),
        (unsafe { kSecAttrTokenID }.to_void(), token.to_void()),
        (
            unsafe { kSecAttrApplicationTag }.to_void(),
            tag_data.to_void(),
        ),
    ];
    if return_ref {
        pairs.push((unsafe { kSecReturnRef }.to_void(), yes.to_void()));
    }
    CFMutableDictionary::from_CFType_pairs(&pairs).to_immutable()
}

fn key_present(tag: &[u8]) -> Result<bool, KeyStoreError> {
    let query = lookup_query(tag, false);
    let status = unsafe { SecItemCopyMatching(query.as_concrete_TypeRef(), ptr::null_mut()) };
    if status == errSecSuccess {
        Ok(true)
    } else if status == errSecItemNotFound {
        Ok(false)
    } else {
        Err(KeyStoreError::PlatformError(
            "SecItemCopyMatching probe failed".into(),
            status,
        ))
    }
}

fn find_private_key(tag: &[u8]) -> Result<Option<SecKey>, KeyStoreError> {
    let query = lookup_query(tag, true);
    let mut result: CFTypeRef = ptr::null();
    let status = unsafe { SecItemCopyMatching(query.as_concrete_TypeRef(), &mut result) };
    if status == errSecItemNotFound {
        return Ok(None);
    }
    if status != errSecSuccess {
        return Err(KeyStoreError::PlatformError(
            "SecItemCopyMatching failed".into(),
            status,
        ));
    }
    if result.is_null() {
        return Ok(None);
    }
    // SecItemCopyMatching returns a +1 CF reference; SecKey::wrap_under_create_rule
    // takes ownership and releases on drop.
    let key = unsafe { SecKey::wrap_under_create_rule(result as SecKeyRef) };
    Ok(Some(key))
}

/// Generate a fresh EC-P256 keypair inside the Secure Enclave, tagged with
/// `tag` and labelled `label` (label is purely informational — shown in
/// Keychain Access). The private key is permanent and lives in the data
/// protection keychain.
fn generate_se_key(tag: &[u8], label: &str) -> Result<SecKey, KeyStoreError> {
    let ac = se_access_control()?;

    let tag_data = CFData::from_buffer(tag);
    let label_cfs = CFString::new(label);
    let yes = CFBoolean::true_value();
    let key_type = unsafe { CFString::wrap_under_get_rule(kSecAttrKeyTypeECSECPrimeRandom) };
    let key_size = CFNumber::from(256i32);
    let token = unsafe { CFString::wrap_under_get_rule(kSecAttrTokenIDSecureEnclave) };

    let priv_pairs = vec![
        (unsafe { kSecAttrIsPermanent }.to_void(), yes.to_void()),
        (
            unsafe { kSecAttrApplicationTag }.to_void(),
            tag_data.to_void(),
        ),
        (unsafe { kSecAttrAccessControl }.to_void(), ac.to_void()),
        (unsafe { kSecAttrLabel }.to_void(), label_cfs.to_void()),
    ];
    let priv_dict = CFMutableDictionary::from_CFType_pairs(&priv_pairs).to_immutable();

    let top_pairs = vec![
        (unsafe { kSecAttrKeyType }.to_void(), key_type.to_void()),
        (
            unsafe { kSecAttrKeySizeInBits }.to_void(),
            key_size.to_void(),
        ),
        (unsafe { kSecAttrTokenID }.to_void(), token.to_void()),
        (
            unsafe { kSecPrivateKeyAttrs }.to_void(),
            priv_dict.to_void(),
        ),
    ];
    let attrs = CFMutableDictionary::from_CFType_pairs(&top_pairs).to_immutable();

    let mut err: CFErrorRef = ptr::null_mut();
    let key_ref = unsafe { SecKeyCreateRandomKey(attrs.as_concrete_TypeRef(), &mut err) };
    if !err.is_null() {
        let e = unsafe { CFError::wrap_under_create_rule(err) };
        return Err(cf_to_provisioning(e));
    }
    if key_ref.is_null() {
        return Err(KeyStoreError::ProvisioningFailed(
            "SecKeyCreateRandomKey returned null".into(),
        ));
    }
    Ok(unsafe { SecKey::wrap_under_create_rule(key_ref) })
}

// ---------------------------------------------------------------------------
// Trait impl
// ---------------------------------------------------------------------------

impl KeyStorageProvider for EnclaveKeyStorage {
    fn status(&self) -> Result<ProviderStatus, KeyStoreError> {
        let _ = se_access_control()?;
        Ok(ProviderStatus {
            available: true,
            backend: Some(Backend::MacosEnclave),
            tpm_version: None,
            tpm_manufacturer: None,
            message: STATUS_MESSAGE.to_string(),
        })
    }

    fn create_key(&self, key_name: &str, exportable: bool) -> Result<KeyInfo, KeyStoreError> {
        if exportable {
            return Err(KeyStoreError::ProvisioningFailed(
                "Secure Enclave keys are not exportable".into(),
            ));
        }
        let tag = tag_for(key_name);
        if key_present(&tag)? {
            return Err(KeyStoreError::KeyAlreadyExists(key_name.to_string()));
        }
        let _key = generate_se_key(&tag, key_name)?;
        Ok(KeyInfo {
            name: key_name.to_string(),
            backend: Backend::MacosEnclave,
            exportable: false,
            algorithm: ALGORITHM_LABEL.to_string(),
        })
    }

    fn open_key(&self, key_name: &str) -> Result<KeyInfo, KeyStoreError> {
        if !key_present(&tag_for(key_name))? {
            return Err(KeyStoreError::KeyNotFound(key_name.to_string()));
        }
        // SE keys produced by this backend are always EC-P256, non-exportable.
        // Skip the SecKeyCopyAttributes round-trip.
        Ok(KeyInfo {
            name: key_name.to_string(),
            backend: Backend::MacosEnclave,
            exportable: false,
            algorithm: ALGORITHM_LABEL.to_string(),
        })
    }

    fn key_exists(&self, key_name: &str) -> Result<bool, KeyStoreError> {
        key_present(&tag_for(key_name))
    }

    fn seal(&self, key_name: &str, plaintext: SecretBytes) -> Result<SealedBlob, KeyStoreError> {
        let priv_key = find_private_key(&tag_for(key_name))?
            .ok_or_else(|| KeyStoreError::KeyNotFound(key_name.to_string()))?;
        let pub_key = priv_key.public_key().ok_or_else(|| {
            KeyStoreError::EncryptionFailed("public key unavailable from Secure Enclave key".into())
        })?;
        let ct = pub_key
            .encrypt_data(ECIES_ALGO, plaintext.as_slice())
            .map_err(cf_to_encryption)?;
        Ok(SealedBlob {
            ciphertext: STANDARD.encode(&ct),
            key_name: key_name.to_string(),
            backend: Backend::MacosEnclave,
        })
    }

    fn unseal(&self, key_name: &str, blob: &SealedBlob) -> Result<SecretBytes, KeyStoreError> {
        let ct = STANDARD
            .decode(&blob.ciphertext)
            .map_err(|e| KeyStoreError::DecryptionFailed(format!("base64 decode failed: {e}")))?;
        let priv_key = find_private_key(&tag_for(key_name))?
            .ok_or_else(|| KeyStoreError::KeyNotFound(key_name.to_string()))?;
        let pt = priv_key
            .decrypt_data(ECIES_ALGO, &ct)
            .map_err(cf_to_decryption)?;
        Ok(SecretBytes::new(pt))
    }

    fn delete_key(&self, key_name: &str) -> Result<(), KeyStoreError> {
        let Some(key) = find_private_key(&tag_for(key_name))? else {
            // Idempotent: nothing to remove.
            return Ok(());
        };
        key.delete().map_err(|e: SfError| {
            KeyStoreError::PlatformError("SecItemDelete failed".into(), e.code())
        })
    }
}

// ---------------------------------------------------------------------------
// Tests — exercise real Keychain + Secure Enclave on the host. Each test
// uses a unique tag and cleans up in a catch_unwind block so a failed
// assertion still removes the provisioned key.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::KeyStorageProvider;
    use std::sync::OnceLock;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn maybe_provider() -> Option<EnclaveKeyStorage> {
        EnclaveKeyStorage::new().ok()
    }

    /// Persisting SE keys requires a code-signed binary with an
    /// application-identifier entitlement; cargo-test binaries are unsigned and
    /// hit errSecMissingEntitlement (-34018) on the keychain-add step. Probe
    /// once per process by trying a real create+delete; tests that need to
    /// provision keys bail when this returns false. The shipped signed `.app`
    /// has the required entitlement and runs the full path in production.
    fn can_provision() -> bool {
        static OK: OnceLock<bool> = OnceLock::new();
        *OK.get_or_init(|| {
            let Some(p) = maybe_provider() else {
                return false;
            };
            let name = unique("probe");
            match p.create_key(&name, false) {
                Ok(_) => {
                    let _ = p.delete_key(&name);
                    true
                }
                Err(_) => false,
            }
        })
    }

    fn unique(label: &str) -> String {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        format!("noem-rust-test-{label}-{}-{nanos}", std::process::id())
    }

    fn cleanup(p: &EnclaveKeyStorage, name: &str) {
        let _ = p.delete_key(name);
    }

    #[test]
    fn status_reports_enclave_backend() {
        let Some(p) = maybe_provider() else { return };
        let s = p.status().unwrap();
        assert!(s.available);
        assert_eq!(s.backend, Some(Backend::MacosEnclave));
        assert!(!s.message.contains("NOT FOR PRODUCTION"));
    }

    #[test]
    fn key_exists_false_for_missing() {
        let Some(p) = maybe_provider() else { return };
        let name = unique("missing");
        assert!(!p.key_exists(&name).unwrap());
    }

    #[test]
    fn create_seal_unseal_roundtrip() {
        let Some(p) = maybe_provider() else { return };
        if !can_provision() {
            return;
        }
        let name = unique("rt");
        let secret = b"correct-horse-battery-staple";
        let outcome = std::panic::catch_unwind(|| {
            let info = p.create_key(&name, false).unwrap();
            assert_eq!(info.algorithm, ALGORITHM_LABEL);
            assert_eq!(info.backend, Backend::MacosEnclave);
            assert!(!info.exportable);
            assert!(p.key_exists(&name).unwrap());

            let blob = p.seal(&name, SecretBytes::new(secret.to_vec())).unwrap();
            assert_eq!(blob.key_name, name);
            assert_eq!(blob.backend, Backend::MacosEnclave);
            assert!(!blob.ciphertext.is_empty());

            let recovered = p.unseal(&name, &blob).unwrap();
            assert_eq!(recovered.as_slice(), secret);

            // One key seals many independent secrets.
            let blob2 = p.seal(&name, SecretBytes::new(b"second".to_vec())).unwrap();
            let r2 = p.unseal(&name, &blob2).unwrap();
            assert_eq!(r2.as_slice(), b"second");
        });
        cleanup(&p, &name);
        outcome.unwrap();
    }

    #[test]
    fn create_key_rejects_exportable() {
        let Some(p) = maybe_provider() else { return };
        let name = unique("exp");
        let err = p.create_key(&name, true).unwrap_err();
        assert!(matches!(err, KeyStoreError::ProvisioningFailed(_)));
    }

    #[test]
    fn create_key_rejects_duplicate() {
        let Some(p) = maybe_provider() else { return };
        if !can_provision() {
            return;
        }
        let name = unique("dup");
        let outcome = std::panic::catch_unwind(|| {
            p.create_key(&name, false).unwrap();
            let err = p.create_key(&name, false).unwrap_err();
            assert!(matches!(err, KeyStoreError::KeyAlreadyExists(_)));
        });
        cleanup(&p, &name);
        outcome.unwrap();
    }

    #[test]
    fn unseal_with_wrong_key_fails() {
        let Some(p) = maybe_provider() else { return };
        if !can_provision() {
            return;
        }
        let a = unique("a");
        let b = unique("b");
        let outcome = std::panic::catch_unwind(|| {
            p.create_key(&a, false).unwrap();
            p.create_key(&b, false).unwrap();
            let blob = p.seal(&a, SecretBytes::new(b"hello".to_vec())).unwrap();
            let bad = SealedBlob {
                ciphertext: blob.ciphertext.clone(),
                key_name: b.clone(),
                backend: Backend::MacosEnclave,
            };
            let err = p.unseal(&b, &bad).unwrap_err();
            assert!(matches!(err, KeyStoreError::DecryptionFailed(_)));
        });
        cleanup(&p, &a);
        cleanup(&p, &b);
        outcome.unwrap();
    }

    #[test]
    fn delete_then_key_exists_false() {
        let Some(p) = maybe_provider() else { return };
        if !can_provision() {
            return;
        }
        let name = unique("del");
        p.create_key(&name, false).unwrap();
        assert!(p.key_exists(&name).unwrap());
        p.delete_key(&name).unwrap();
        assert!(!p.key_exists(&name).unwrap());
    }

    #[test]
    fn delete_missing_is_ok() {
        let Some(p) = maybe_provider() else { return };
        let name = unique("ghost");
        assert!(p.delete_key(&name).is_ok());
    }
}
