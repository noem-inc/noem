use napi_derive::napi;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use zeroize::Zeroize;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum KeyStoreError {
    #[error("TPM/Keychain provider not available on this platform")]
    ProviderUnavailable,

    #[error("Key '{0}' not found")]
    KeyNotFound(String),

    #[error("Key '{0}' already exists")]
    KeyAlreadyExists(String),

    #[error("Encryption failed: {0}")]
    EncryptionFailed(String),

    #[error("Decryption failed: {0}")]
    DecryptionFailed(String),

    #[error("Key provisioning failed: {0}")]
    ProvisioningFailed(String),

    #[error("Platform error: {0} (code: {1})")]
    PlatformError(String, u32),
}

impl From<KeyStoreError> for napi::Error {
    fn from(e: KeyStoreError) -> Self {
        napi::Error::from_reason(e.to_string())
    }
}

// ---------------------------------------------------------------------------
// Key metadata returned to JS
// ---------------------------------------------------------------------------

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyInfo {
    /// Unique key name within the provider
    pub name: String,

    /// Backend that holds this key (see `Backend`).
    pub backend: Backend,

    /// Whether the key can be exported (should always be false in production)
    pub exportable: bool,

    /// Key algorithm, e.g. "RSA-2048", "AES-256"
    pub algorithm: String,
}

// ---------------------------------------------------------------------------
// Provider health / diagnostic info
// ---------------------------------------------------------------------------

/// Key storage backend identifier. Serializes to the snake_case string on the
/// JS side: "ncrypt_tpm" | "macos_keychain". Absence of a backend (e.g. an
/// unavailable provider) is modeled with `Option<Backend>`, not a variant.
#[napi(string_enum = "snake_case")]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Backend {
    NcryptTpm,
    MacosKeychain,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderStatus {
    /// Whether the provider is available and functional
    pub available: bool,

    /// Which backend is active, or `None` when no provider is available.
    pub backend: Option<Backend>,

    /// TPM spec version if applicable, e.g. "2.0"
    pub tpm_version: Option<String>,

    /// TPM manufacturer if available
    pub tpm_manufacturer: Option<String>,

    /// Human-readable status message
    pub message: String,
}

// ---------------------------------------------------------------------------
// Encrypted blob returned from seal operations
// ---------------------------------------------------------------------------

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SealedBlob {
    /// The encrypted ciphertext (base64-encoded for JS interop)
    pub ciphertext: String,

    /// Name of the key used to seal
    pub key_name: String,

    /// Backend that produced this blob (see `Backend`).
    pub backend: Backend,
}

// ---------------------------------------------------------------------------
// Sensitive buffer wrapper — zeroed on drop
// ---------------------------------------------------------------------------

#[derive(Zeroize)]
#[zeroize(drop)]
pub struct SecretBytes(pub Vec<u8>);

impl SecretBytes {
    pub fn new(data: Vec<u8>) -> Self {
        Self(data)
    }

    pub fn as_slice(&self) -> &[u8] {
        &self.0
    }
}

impl std::fmt::Debug for SecretBytes {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "SecretBytes([REDACTED; {} bytes])", self.0.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_bytes_roundtrip() {
        let s = SecretBytes::new(vec![1, 2, 3, 4]);
        assert_eq!(s.as_slice(), &[1, 2, 3, 4]);
    }

    #[test]
    fn secret_bytes_debug_redacts_contents() {
        let dbg = format!("{:?}", SecretBytes::new(vec![0xAB; 5]));
        assert!(dbg.contains("REDACTED"));
        assert!(dbg.contains("5 bytes"));
        assert!(!dbg.contains("171")); // 0xAB never printed
    }

    #[test]
    fn error_display_messages() {
        assert_eq!(
            KeyStoreError::ProviderUnavailable.to_string(),
            "TPM/Keychain provider not available on this platform"
        );
        assert_eq!(
            KeyStoreError::KeyNotFound("k".into()).to_string(),
            "Key 'k' not found"
        );
        assert_eq!(
            KeyStoreError::KeyAlreadyExists("k".into()).to_string(),
            "Key 'k' already exists"
        );
        assert_eq!(
            KeyStoreError::EncryptionFailed("boom".into()).to_string(),
            "Encryption failed: boom"
        );
        assert_eq!(
            KeyStoreError::DecryptionFailed("boom".into()).to_string(),
            "Decryption failed: boom"
        );
        assert_eq!(
            KeyStoreError::ProvisioningFailed("boom".into()).to_string(),
            "Key provisioning failed: boom"
        );
        assert_eq!(
            KeyStoreError::PlatformError("oops".into(), 5).to_string(),
            "Platform error: oops (code: 5)"
        );
    }

    #[test]
    fn keystore_error_maps_to_napi_error_reason() {
        let err: napi::Error = KeyStoreError::KeyNotFound("abc".into()).into();
        assert_eq!(err.reason, "Key 'abc' not found");
    }

    #[test]
    fn backend_serde_snake_case() {
        assert_eq!(
            serde_json::to_string(&Backend::NcryptTpm).unwrap(),
            "\"ncrypt_tpm\""
        );
        assert_eq!(
            serde_json::to_string(&Backend::MacosKeychain).unwrap(),
            "\"macos_keychain\""
        );
        let b: Backend = serde_json::from_str("\"ncrypt_tpm\"").unwrap();
        assert_eq!(b, Backend::NcryptTpm);
    }
}
