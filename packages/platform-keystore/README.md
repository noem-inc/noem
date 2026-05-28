# @noem/platform-keystore

[![Release](https://github.com/noem-inc/noem/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/noem-inc/noem/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/@noem/platform-keystore.svg)](https://www.npmjs.com/package/@noem/platform-keystore)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

> [!NOTE]
> **AI was used extensively in this implementation.** The code was largely
> AI-generated. Review carefully before relying on it, especially the
> security-sensitive cryptographic paths.

TPM-backed key storage for Node, exposed as a NAPI-RS native addon. Provision
non-exportable hardware keys and seal/unseal secrets (e.g. a database password) against
them — the private key never leaves the secure hardware.

## Platform support

| Platform | Backend                         | Status                            |
| -------- | ------------------------------- | --------------------------------- |
| Windows  | TPM via NCrypt Platform KSP     | ✅ Implemented (production)       |
| macOS    | Keychain / Secure Enclave (dev) | 🚧 **Not implemented yet** (stub) |
| Other    | —                               | ❌ Unsupported                    |

> **macOS is not implemented yet.** The macOS backend (`DevKeyStorage`) is a development
> stub: `seal`/`unseal` throw "not yet implemented", and the remaining operations are
> placeholders. It exists to validate the cross-platform plumbing only and must **not** be
> used in production.

Requires Windows with a TPM 2.0. On hardware without a TPM (e.g. CI runners),
`getProviderStatus()` throws `ProviderUnavailable`.

## Installation

```sh
pnpm add @noem/platform-keystore
```

Requires Node >= 18.

## Usage

Every function is **async by default** (returns a `Promise`; the blocking TPM
work runs on the libuv threadpool, so it never blocks the JS thread). Each has a
blocking `*Sync` sibling (e.g. `sealSync`) for callers that want it.

```ts
import {
  getProviderStatus,
  createKey,
  keyExists,
  seal,
  unseal,
} from "@noem/platform-keystore";

const status = await getProviderStatus();
// { available: true, backend: 'ncrypt_tpm', tpmVersion: '2.0', ... }

// One key per app/device seals many secrets. Provision once (e.g. at startup);
// a missing key signals a problem, so check explicitly rather than auto-create.
const KEY = "noem-db-key";
if (!(await keyExists(KEY))) await createKey(KEY);

const sealed = await seal(KEY, Buffer.from("super-secret-db-password"));
// persist `sealed` to disk as-is — ciphertext is base64 and safe at rest

const plaintext = await unseal(KEY, sealed); // Buffer
// pass straight to SQLCipher PRAGMA key, then drop the reference
```

Synchronous equivalent (blocks the calling thread):

```ts
import {
  keyExistsSync,
  createKeySync,
  sealSync,
} from "@noem/platform-keystore";

const KEY = "noem-db-key";
if (!keyExistsSync(KEY)) createKeySync(KEY);
const sealed = sealSync(KEY, Buffer.from("super-secret-db-password"));
```

## API

Async functions reject on error; their `*Sync` siblings throw (napi maps
`KeyStoreError` to an `Error` either way). Each row lists the async signature;
the sync variant has the same args and an unwrapped return type
(e.g. `sealSync(...): SealedBlob`).

- `getProviderStatus(): Promise<ProviderStatus>` — backend availability + TPM info.
- `createKey(keyName: string): Promise<KeyInfo>` — provision a new non-exportable key.
  Rejects if it already exists (check `keyExists` first).
- `openKey(keyName: string): Promise<KeyInfo>` — metadata for an existing key; rejects if absent.
- `keyExists(keyName: string): Promise<boolean>`
- `seal(keyName: string, plaintext: Buffer): Promise<SealedBlob>` — encrypt; ciphertext is
  base64-encoded for safe storage.
- `unseal(keyName: string, blob: SealedBlob): Promise<Buffer>` — decrypt.
- `deleteKey(keyName: string): Promise<void>` — **irreversible**; any data sealed with the key
  becomes unrecoverable.

Sync variants: `getProviderStatusSync`, `createKeySync`, `openKeySync`,
`keyExistsSync`, `sealSync`, `unsealSync`, `deleteKeySync`.

### Types

```ts
type Backend = "ncrypt_tpm" | "macos_keychain";

interface ProviderStatus {
  available: boolean;
  backend?: Backend;
  tpmVersion?: string; // e.g. "2.0"
  tpmManufacturer?: string;
  message: string;
}

interface KeyInfo {
  name: string;
  backend: Backend;
  exportable: boolean; // always false in production
  algorithm: string; // e.g. "RSA-2048"
}

interface SealedBlob {
  ciphertext: string; // base64
  keyName: string;
  backend: Backend;
}
```

## Security notes

- Keys are **non-exportable** — the TPM rejects provisioning exportable keys.
- The Rust side zeroes its plaintext copies on drop (`zeroize`). JS `Buffer`s **cannot** be
  reliably zeroed due to V8 GC — minimize their lifetime and avoid copying.
- `deleteKey` is destructive and irreversible.

## Development

```sh
pnpm build        # napi build (CJS + ESM) into dist/
pnpm test         # vitest
pnpm lint         # biome + cargo fmt + clippy + tsc
```

The native crate is `noem-platform-keystore` (`Cargo.toml`); Rust sources live in `src/`.
