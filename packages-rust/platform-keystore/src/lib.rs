mod provider;
mod types;

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
mod macos;

use napi::Task;
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
// in the work helpers converts via `From<KeyStoreError> for napi::Error`.
fn create_provider() -> std::result::Result<Box<dyn KeyStorageProvider>, KeyStoreError> {
    #[cfg(target_os = "windows")]
    {
        let provider = windows::TpmKeyStorage::new()?;
        return Ok(Box::new(provider));
    }

    #[cfg(target_os = "macos")]
    {
        let provider = macos::EnclaveKeyStorage::new()?;
        Ok(Box::new(provider))
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        return Err(KeyStoreError::ProviderUnavailable);
    }
}

// ---------------------------------------------------------------------------
// Work helpers — pure (non-napi) logic shared by the async and sync variants.
//
// These run on a libuv threadpool thread inside `Task::compute` (async path) or
// directly on the JS thread (`*Sync` path). They must NOT touch the JS `Env`.
// Each opens the provider per call, matching the existing open-per-operation
// design (see `windows::ncrypt`'s rationale).
// ---------------------------------------------------------------------------

fn do_status() -> std::result::Result<ProviderStatus, KeyStoreError> {
    create_provider()?.status()
}

fn do_create(key_name: &str) -> std::result::Result<KeyInfo, KeyStoreError> {
    create_provider()?.create_key(key_name, false)
}

fn do_open(key_name: &str) -> std::result::Result<KeyInfo, KeyStoreError> {
    create_provider()?.open_key(key_name)
}

fn do_key_exists(key_name: &str) -> std::result::Result<bool, KeyStoreError> {
    create_provider()?.key_exists(key_name)
}

fn do_seal(
    key_name: &str,
    plaintext: SecretBytes,
) -> std::result::Result<SealedBlob, KeyStoreError> {
    create_provider()?.seal(key_name, plaintext)
}

fn do_unseal(key_name: &str, blob: &SealedBlob) -> std::result::Result<Vec<u8>, KeyStoreError> {
    let secret = create_provider()?.unseal(key_name, blob)?;
    Ok(secret.as_slice().to_vec())
}

fn do_delete(key_name: &str) -> std::result::Result<(), KeyStoreError> {
    create_provider()?.delete_key(key_name)
}

// ---------------------------------------------------------------------------
// Async task wrappers — run blocking TPM work on the libuv threadpool.
// ---------------------------------------------------------------------------

/// Generic task for ops whose JS return value is the Rust value directly.
/// The closure is run once on a worker thread; `KeyStoreError` is mapped to a
/// thrown JS `Error` via the existing `From` impl.
pub struct BlockingTask<T> {
    work: Option<Box<dyn FnOnce() -> std::result::Result<T, KeyStoreError> + Send>>,
}

impl<T> BlockingTask<T> {
    fn new(work: impl FnOnce() -> std::result::Result<T, KeyStoreError> + Send + 'static) -> Self {
        Self {
            work: Some(Box::new(work)),
        }
    }
}

impl<T: Send + 'static + ToNapiValue + TypeName> Task for BlockingTask<T> {
    type Output = T;
    type JsValue = T;

    fn compute(&mut self) -> napi::Result<T> {
        let work = self
            .work
            .take()
            .expect("BlockingTask::compute called twice");
        Ok(work()?)
    }

    fn resolve(&mut self, _env: Env, output: T) -> napi::Result<T> {
        Ok(output)
    }
}

/// `unseal` returns a `Buffer`, which cannot be constructed off the JS thread.
/// Decrypt to `Vec<u8>` in `compute`, then build the `Buffer` in `resolve`.
pub struct UnsealTask {
    key_name: String,
    blob: SealedBlob,
}

impl Task for UnsealTask {
    type Output = Vec<u8>;
    type JsValue = Buffer;

    fn compute(&mut self) -> napi::Result<Vec<u8>> {
        Ok(do_unseal(&self.key_name, &self.blob)?)
    }

    fn resolve(&mut self, _env: Env, output: Vec<u8>) -> napi::Result<Buffer> {
        Ok(Buffer::from(output))
    }
}

// ---------------------------------------------------------------------------
// JS-exported functions (napi)
//
// The unsuffixed name is async (returns a Promise, work runs off the JS thread).
// Each has a blocking `*Sync` sibling for callers that opt into blocking.
// ---------------------------------------------------------------------------

/// Check whether the key storage backend is available and functional.
/// Returns provider status including backend type and TPM version.
#[napi(ts_return_type = "Promise<ProviderStatus>")]
pub fn get_provider_status() -> AsyncTask<BlockingTask<ProviderStatus>> {
    AsyncTask::new(BlockingTask::new(do_status))
}

/// Synchronous variant of {@link getProviderStatus}. Blocks the calling thread.
#[napi]
pub fn get_provider_status_sync() -> napi::Result<ProviderStatus> {
    Ok(do_status()?)
}

/// Provision a new hardware-backed key.
///
/// On Windows: creates a non-exportable RSA-2048 key in the TPM via NCrypt.
/// On macOS: creates a non-exportable EC-P256 key in the Secure Enclave.
///
/// Rejects if the key already exists. Call `keyExists()` first to check.
#[napi(ts_return_type = "Promise<KeyInfo>")]
pub fn create_key(key_name: String) -> AsyncTask<BlockingTask<KeyInfo>> {
    AsyncTask::new(BlockingTask::new(move || do_create(&key_name)))
}

/// Synchronous variant of {@link createKey}. Blocks the calling thread.
#[napi]
pub fn create_key_sync(key_name: String) -> napi::Result<KeyInfo> {
    Ok(do_create(&key_name)?)
}

/// Open and return metadata for an existing key.
/// Rejects if the key does not exist.
#[napi(ts_return_type = "Promise<KeyInfo>")]
pub fn open_key(key_name: String) -> AsyncTask<BlockingTask<KeyInfo>> {
    AsyncTask::new(BlockingTask::new(move || do_open(&key_name)))
}

/// Synchronous variant of {@link openKey}. Blocks the calling thread.
#[napi]
pub fn open_key_sync(key_name: String) -> napi::Result<KeyInfo> {
    Ok(do_open(&key_name)?)
}

/// Check whether a key with the given name exists.
#[napi(ts_return_type = "Promise<boolean>")]
pub fn key_exists(key_name: String) -> AsyncTask<BlockingTask<bool>> {
    AsyncTask::new(BlockingTask::new(move || do_key_exists(&key_name)))
}

/// Synchronous variant of {@link keyExists}. Blocks the calling thread.
#[napi]
pub fn key_exists_sync(key_name: String) -> napi::Result<bool> {
    Ok(do_key_exists(&key_name)?)
}

/// Encrypt (seal) a secret using the named TPM/Secure Enclave key.
///
/// The plaintext Buffer is copied into a zeroizing buffer on the JS thread,
/// then encrypted on a worker thread. The returned SealedBlob contains
/// base64-encoded ciphertext safe for storage on disk.
///
/// SECURITY: The plaintext Buffer passed from JS cannot be reliably zeroed
/// due to V8 GC. Minimize the lifetime of the Buffer on the JS side.
/// The Rust side zeroes its copy on drop via the `zeroize` crate.
#[napi(ts_return_type = "Promise<SealedBlob>")]
pub fn seal(key_name: String, plaintext: Buffer) -> AsyncTask<BlockingTask<SealedBlob>> {
    let secret = SecretBytes::new(plaintext.to_vec());
    AsyncTask::new(BlockingTask::new(move || do_seal(&key_name, secret)))
}

/// Synchronous variant of {@link seal}. Blocks the calling thread.
#[napi]
pub fn seal_sync(key_name: String, plaintext: Buffer) -> napi::Result<SealedBlob> {
    Ok(do_seal(&key_name, SecretBytes::new(plaintext.to_vec()))?)
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
#[napi(ts_return_type = "Promise<Buffer>")]
pub fn unseal(key_name: String, blob: SealedBlob) -> AsyncTask<UnsealTask> {
    AsyncTask::new(UnsealTask { key_name, blob })
}

/// Synchronous variant of {@link unseal}. Blocks the calling thread.
#[napi]
pub fn unseal_sync(key_name: String, blob: SealedBlob) -> napi::Result<Buffer> {
    Ok(Buffer::from(do_unseal(&key_name, &blob)?))
}

/// Permanently delete a key. Irreversible.
///
/// Any data sealed with this key becomes unrecoverable.
/// Intended for decommission workflows only.
#[napi(ts_return_type = "Promise<void>")]
pub fn delete_key(key_name: String) -> AsyncTask<BlockingTask<()>> {
    AsyncTask::new(BlockingTask::new(move || do_delete(&key_name)))
}

/// Synchronous variant of {@link deleteKey}. Blocks the calling thread.
#[napi]
pub fn delete_key_sync(key_name: String) -> napi::Result<()> {
    Ok(do_delete(&key_name)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use napi::Task; // for `.compute()` method resolution

    // macOS: confirm the work helpers wire through to the real Secure Enclave
    // backend. Skip cleanly on hosts where the SE probe fails (e.g. Intel Macs
    // without a T2). The deep roundtrip lives in `macos::keychain::tests`.
    #[cfg(target_os = "macos")]
    #[test]
    fn do_status_reports_backend() {
        let Ok(s) = do_status() else { return };
        assert_eq!(s.backend, Some(Backend::MacosEnclave));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn do_key_exists_false_for_missing_on_macos() {
        if do_status().is_err() {
            return;
        }
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let name = format!(
            "noem-rust-test-lib-missing-{}-{}",
            std::process::id(),
            nanos
        );
        assert!(!do_key_exists(&name).unwrap());
    }

    // Windows: same helpers exercise the real TPM backend via `create_provider()`.
    // Skip when no TPM is present (CI Windows runners) — `do_status()` fails with
    // `ProviderUnavailable` there. The deep roundtrip lives in `ncrypt::tests`;
    // these just confirm the lib.rs `do_*` wiring on the Windows arm.
    #[cfg(target_os = "windows")]
    #[test]
    fn do_status_reports_tpm_on_windows() {
        let Ok(s) = do_status() else { return };
        assert_eq!(s.backend, Some(Backend::NcryptTpm));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn do_key_exists_false_for_missing_on_windows() {
        if do_status().is_err() {
            return; // no TPM
        }
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let name = format!(
            "noem-rust-test-lib-missing-{}-{}",
            std::process::id(),
            nanos
        );
        assert!(!do_key_exists(&name).unwrap());
    }

    #[test]
    fn blocking_task_compute_returns_value() {
        let mut task = BlockingTask::new(|| Ok::<_, KeyStoreError>(7i32));
        assert_eq!(task.compute().unwrap(), 7);
    }

    #[test]
    fn blocking_task_compute_maps_error_to_napi() {
        let mut task = BlockingTask::new(|| Err::<i32, _>(KeyStoreError::ProviderUnavailable));
        let err = task.compute().unwrap_err();
        assert_eq!(
            err.reason,
            "TPM/Secure Enclave provider not available on this platform"
        );
    }
}
