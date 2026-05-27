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

    /// "tpm" | "secure_enclave" | "software"
    pub backend: String,

    /// Whether the key can be exported (should always be false in production)
    pub exportable: bool,

    /// Key algorithm, e.g. "RSA-2048", "AES-256"
    pub algorithm: String,
}

// ---------------------------------------------------------------------------
// Provider health / diagnostic info
// ---------------------------------------------------------------------------

/// Key storage backend identifier. Serializes to the snake_case string on the
/// JS side: "ncrypt_tpm" | "macos_keychain" | "none".
#[napi(string_enum = "snake_case")]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Backend {
    NcryptTpm,
    MacosKeychain,
    None,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderStatus {
    /// Whether the provider is available and functional
    pub available: bool,

    /// Which backend is active (see `Backend`).
    pub backend: Backend,

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

    /// Backend that produced this blob
    pub backend: String,
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
