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
            backend: Backend::MacosKeychain,
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
            backend: "macos_keychain".to_string(),
            exportable: false,
            algorithm: "EC-P256-SE".to_string(),
        })
    }

    fn open_key(&self, key_name: &str) -> Result<KeyInfo, KeyStoreError> {
        // TODO: Query Keychain for key by kSecAttrLabel == key_name
        // Return KeyNotFound if absent

        Ok(KeyInfo {
            name: key_name.to_string(),
            backend: "macos_keychain".to_string(),
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
