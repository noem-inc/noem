use crate::types::{KeyInfo, KeyStoreError, ProviderStatus, SealedBlob, SecretBytes};

// ---------------------------------------------------------------------------
// Core trait — platform backends implement this
// ---------------------------------------------------------------------------

pub trait KeyStorageProvider: Send + Sync {
    /// Check whether the provider is available and functional.
    /// On Windows: verifies TPM 2.0 is present and NCrypt Platform KSP loads.
    /// On macOS:   verifies Keychain access and Secure Enclave availability.
    fn status(&self) -> Result<ProviderStatus, KeyStoreError>;

    /// Provision a new hardware-backed key.
    ///
    /// - `key_name`:   Unique identifier for the key within the provider.
    /// - `exportable`: Must be `false` for production (TPM non-exportable).
    ///                 Dev backend may allow `true` for testing.
    ///
    /// Returns metadata about the created key.
    /// Fails with `KeyAlreadyExists` if a key with this name is already provisioned.
    fn create_key(&self, key_name: &str, exportable: bool) -> Result<KeyInfo, KeyStoreError>;

    /// Open a handle to an existing key by name.
    /// Returns metadata. Fails with `KeyNotFound` if absent.
    fn open_key(&self, key_name: &str) -> Result<KeyInfo, KeyStoreError>;

    /// Check whether a key with this name exists without opening it.
    fn key_exists(&self, key_name: &str) -> Result<bool, KeyStoreError>;

    /// Encrypt (seal) plaintext using the named key.
    ///
    /// The plaintext is consumed and zeroed after encryption.
    /// Returns a `SealedBlob` containing the ciphertext.
    fn seal(&self, key_name: &str, plaintext: SecretBytes) -> Result<SealedBlob, KeyStoreError>;

    /// Decrypt (unseal) a previously sealed blob using the named key.
    ///
    /// Returns the plaintext in a `SecretBytes` wrapper that zeroes on drop.
    fn unseal(&self, key_name: &str, blob: &SealedBlob) -> Result<SecretBytes, KeyStoreError>;

    /// Permanently delete a key from the provider.
    ///
    /// WARNING: This is destructive. Any data sealed with this key becomes
    /// unrecoverable. Intended for decommission workflows only.
    fn delete_key(&self, key_name: &str) -> Result<(), KeyStoreError>;
}
