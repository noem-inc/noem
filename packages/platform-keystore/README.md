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

```ts
import {
  getProviderStatus,
  createKey,
  keyExists,
  seal,
  unseal,
} from "@noem/platform-keystore";

const status = getProviderStatus();
// { available: true, backend: 'ncrypt_tpm', tpmVersion: '2.0', ... }

const KEY = "noem-db-key";
if (!keyExists(KEY)) createKey(KEY);

const sealed = seal(KEY, Buffer.from("super-secret-db-password"));
// persist `sealed` to disk — ciphertext is base64

const plaintext = unseal(KEY, sealed); // Buffer
// pass straight to SQLCipher PRAGMA key, then drop the reference
```

## API

All functions throw on error (napi maps `KeyStoreError` to a thrown `Error`).

- `getProviderStatus(): ProviderStatus` — backend availability + TPM info.
- `createKey(keyName: string): KeyInfo` — provision a new non-exportable key. Throws if it
  already exists (check `keyExists` first).
- `openKey(keyName: string): KeyInfo` — metadata for an existing key; throws if absent.
- `keyExists(keyName: string): boolean`
- `seal(keyName: string, plaintext: Buffer): SealedBlob` — encrypt; ciphertext is
  base64-encoded for safe storage.
- `unseal(keyName: string, blob: SealedBlob): Buffer` — decrypt.
- `deleteKey(keyName: string): void` — **irreversible**; any data sealed with the key
  becomes unrecoverable.

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
