mod provider;
mod types;

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
mod macos;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use provider::KeyStorageProvider;
use types::*;

// ---------------------------------------------------------------------------
// Platform-specific provider construction
// ---------------------------------------------------------------------------

// NOTE: `napi::bindgen_prelude::*` brings napi's own `Result<T, S = Status>` alias
// into scope, so a bare `Result<_, KeyStoreError>` here would resolve to
// `Result<_, napi::Error<KeyStoreError>>` (requiring `KeyStoreError: AsRef<str>`).
// Qualify with `std::result::Result` to get the plain error type the `?` operator
// in the exported functions converts via `From<KeyStoreError> for napi::Error`.
fn create_provider() -> std::result::Result<Box<dyn KeyStorageProvider>, KeyStoreError> {
    #[cfg(target_os = "windows")]
    {
        let provider = windows::TpmKeyStorage::new()?;
        return Ok(Box::new(provider));
    }

    #[cfg(target_os = "macos")]
    {
        let provider = macos::DevKeyStorage::new()?;
        Ok(Box::new(provider))
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        return Err(KeyStoreError::ProviderUnavailable);
    }
}

// ---------------------------------------------------------------------------
// JS-exported functions (napi)
// ---------------------------------------------------------------------------

/// Check whether the key storage backend is available and functional.
/// Returns provider status including backend type and TPM version.
#[napi]
pub fn get_provider_status() -> napi::Result<ProviderStatus> {
    let provider = create_provider()?;
    Ok(provider.status()?)
}

/// Provision a new hardware-backed key.
///
/// On Windows: creates a non-exportable RSA-2048 key in the TPM via NCrypt.
/// On macOS (dev): creates an EC-P256 key in the Secure Enclave via Keychain.
///
/// Throws if the key already exists. Call `keyExists()` first to check.
#[napi]
pub fn create_key(key_name: String) -> napi::Result<KeyInfo> {
    let provider = create_provider()?;
    Ok(provider.create_key(&key_name, false)?)
}

/// Open and return metadata for an existing key.
/// Throws if the key does not exist.
#[napi]
pub fn open_key(key_name: String) -> napi::Result<KeyInfo> {
    let provider = create_provider()?;
    Ok(provider.open_key(&key_name)?)
}

/// Check whether a key with the given name exists.
#[napi]
pub fn key_exists(key_name: String) -> napi::Result<bool> {
    let provider = create_provider()?;
    Ok(provider.key_exists(&key_name)?)
}

/// Encrypt (seal) a secret using the named TPM/Secure Enclave key.
///
/// The plaintext Buffer is consumed. The returned SealedBlob contains
/// base64-encoded ciphertext safe for storage on disk.
///
/// SECURITY: The plaintext Buffer passed from JS cannot be reliably zeroed
/// due to V8 GC. Minimize the lifetime of the Buffer on the JS side.
/// The Rust side zeroes its copy on drop via the `zeroize` crate.
#[napi]
pub fn seal(key_name: String, plaintext: Buffer) -> napi::Result<SealedBlob> {
    let provider = create_provider()?;
    let secret = SecretBytes::new(plaintext.to_vec());
    Ok(provider.seal(&key_name, secret)?)
}

/// Decrypt (unseal) a previously sealed blob.
///
/// Returns the plaintext as a Buffer. Caller must minimize the lifetime
/// of this Buffer and avoid copying it unnecessarily.
///
/// SECURITY: The Rust-side plaintext is zeroed on drop. The JS Buffer
/// cannot be reliably zeroed — this is an inherent limitation of the
/// Node.js/V8 runtime. For the DB password use case, pass the result
/// directly to SQLCipher's PRAGMA key and discard the reference.
#[napi]
pub fn unseal(key_name: String, blob: SealedBlob) -> napi::Result<Buffer> {
    let provider = create_provider()?;
    let secret = provider.unseal(&key_name, &blob)?;
    Ok(Buffer::from(secret.as_slice()))
}

/// Permanently delete a key. Irreversible.
///
/// Any data sealed with this key becomes unrecoverable.
/// Intended for decommission workflows only.
#[napi]
pub fn delete_key(key_name: String) -> napi::Result<()> {
    let provider = create_provider()?;
    Ok(provider.delete_key(&key_name)?)
}
