#![cfg(target_os = "macos")]

use crate::provider::KeyStorageProvider;
use crate::types::*;

// ---------------------------------------------------------------------------
// DevKeyStorage — macOS Keychain + Secure Enclave
//
// DEV ONLY. This backend must never be packaged into production builds.
// It uses the macOS Keychain Services API to store keys, backed by
// the Secure Enclave on Apple Silicon for encrypt/decrypt operations.
//
// This validates the full seal/unseal flow during development without
// mocking, but is NOT a substitute for testing on the Windows TPM path.
// ---------------------------------------------------------------------------

pub struct DevKeyStorage;

impl DevKeyStorage {
    pub fn new() -> Result<Self, KeyStoreError> {
        Ok(Self)
    }
}

impl KeyStorageProvider for DevKeyStorage {
    fn status(&self) -> Result<ProviderStatus, KeyStoreError> {
        // TODO: Check Secure Enclave availability via SecAccessControlCreateFlags
        Ok(ProviderStatus {
            available: true,
            backend: Some(Backend::MacosKeychain),
            tpm_version: None,
            tpm_manufacturer: None,
            message: "macOS Keychain (dev backend) — NOT FOR PRODUCTION".to_string(),
        })
    }

    fn create_key(&self, key_name: &str, _exportable: bool) -> Result<KeyInfo, KeyStoreError> {
        if self.key_exists(key_name)? {
            return Err(KeyStoreError::KeyAlreadyExists(key_name.to_string()));
        }

        // TODO: Use security_framework::key::SecKey to generate an EC key
        // with kSecAttrTokenIDSecureEnclave on Apple Silicon.
        //
        // Steps:
        // 1. Create access control with SecAccessControlCreateWithFlags
        //    (kSecAttrAccessibleWhenUnlockedThisDeviceOnly +
        //     kSecAccessControlPrivateKeyUsage)
        // 2. Generate key pair via SecKey::generate with:
        //    - kSecAttrKeyTypeECSECPrimeRandom
        //    - kSecAttrKeySizeInBits: 256
        //    - kSecAttrTokenID: kSecAttrTokenIDSecureEnclave
        //    - kSecAttrLabel: key_name
        // 3. Store in Keychain (happens automatically with Secure Enclave keys)

        Ok(KeyInfo {
            name: key_name.to_string(),
            backend: Backend::MacosKeychain,
            exportable: false,
            algorithm: "EC-P256-SE".to_string(),
        })
    }

    fn open_key(&self, key_name: &str) -> Result<KeyInfo, KeyStoreError> {
        // TODO: Query Keychain for key by kSecAttrLabel == key_name
        // Return KeyNotFound if absent

        Ok(KeyInfo {
            name: key_name.to_string(),
            backend: Backend::MacosKeychain,
            exportable: false,
            algorithm: "EC-P256-SE".to_string(),
        })
    }

    fn key_exists(&self, _key_name: &str) -> Result<bool, KeyStoreError> {
        // TODO: SecItemCopyMatching query with kSecReturnRef = false
        Ok(false)
    }

    fn seal(&self, _key_name: &str, _plaintext: SecretBytes) -> Result<SealedBlob, KeyStoreError> {
        // TODO: Retrieve public key from Keychain
        // Encrypt with SecKeyCreateEncryptedData using
        // kSecKeyAlgorithmECIESEncryptionCofactorVariableIVX963SHA256AESGCM

        Err(KeyStoreError::EncryptionFailed(
            "macOS seal not yet implemented".to_string(),
        ))
    }

    fn unseal(&self, _key_name: &str, _blob: &SealedBlob) -> Result<SecretBytes, KeyStoreError> {
        // TODO: Retrieve private key from Keychain (Secure Enclave)
        // Decrypt with SecKeyCreateDecryptedData

        Err(KeyStoreError::DecryptionFailed(
            "macOS unseal not yet implemented".to_string(),
        ))
    }

    fn delete_key(&self, _key_name: &str) -> Result<(), KeyStoreError> {
        // TODO: SecItemDelete with kSecAttrLabel == key_name
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::KeyStorageProvider;

    fn provider() -> DevKeyStorage {
        DevKeyStorage::new().unwrap()
    }

    #[test]
    fn status_reports_dev_backend() {
        let s = provider().status().unwrap();
        assert!(s.available);
        assert_eq!(s.backend, Some(Backend::MacosKeychain));
        assert!(s.message.contains("NOT FOR PRODUCTION"));
    }

    #[test]
    fn create_key_returns_metadata() {
        let info = provider().create_key("k", false).unwrap();
        assert_eq!(info.name, "k");
        assert_eq!(info.backend, Backend::MacosKeychain);
        assert!(!info.exportable);
        assert_eq!(info.algorithm, "EC-P256-SE");
    }

    #[test]
    fn open_key_returns_metadata() {
        let info = provider().open_key("k").unwrap();
        assert_eq!(info.algorithm, "EC-P256-SE");
        assert_eq!(info.backend, Backend::MacosKeychain);
    }

    #[test]
    fn key_exists_is_false_in_stub() {
        assert!(!provider().key_exists("k").unwrap());
    }

    #[test]
    fn seal_and_unseal_not_implemented() {
        let seal_err = provider()
            .seal("k", SecretBytes::new(b"x".to_vec()))
            .unwrap_err();
        assert!(matches!(seal_err, KeyStoreError::EncryptionFailed(_)));
        assert!(seal_err.to_string().contains("not yet implemented"));

        let blob = SealedBlob {
            ciphertext: String::new(),
            key_name: "k".into(),
            backend: Backend::MacosKeychain,
        };
        let unseal_err = provider().unseal("k", &blob).unwrap_err();
        assert!(matches!(unseal_err, KeyStoreError::DecryptionFailed(_)));
        assert!(unseal_err.to_string().contains("not yet implemented"));
    }

    #[test]
    fn delete_key_is_ok() {
        assert!(provider().delete_key("k").is_ok());
    }
}
