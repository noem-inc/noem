# @noem/platform-keystore

[![Release](https://github.com/noem-inc/noem/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/noem-inc/noem/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/@noem/platform-keystore.svg)](https://www.npmjs.com/package/@noem/platform-keystore)
[![Security: Trusted Publisher](https://img.shields.io/badge/security-trusted--publisher-green?logo=github)](https://www.npmjs.com/package/@noem/platform-keystore)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/noem-inc/noem/badge)](https://securityscorecards.dev/viewer/?uri=github.com/noem-inc/noem)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/License-MIT%20OR%20Apache--2.0-blue.svg)](https://github.com/noem-inc/noem#MIT-2-ov-file)

> [!NOTE]
> **AI was used extensively in this implementation.** The code was largely
> AI-generated. Review carefully before relying on it, especially the
> security-sensitive cryptographic paths.

Hardware-backed key storage for Node, exposed as a NAPI-RS native addon. Provision
non-exportable hardware keys and seal/unseal secrets (e.g. a database password) against
them — the private key never leaves the secure hardware (TPM on Windows, Secure Enclave on
Apple Silicon).

## Platform support

| Platform         | Backend                         | Status                                |
| ---------------- | ------------------------------- | ------------------------------------- |
| Windows          | TPM 2.0 via NCrypt Platform KSP | ✅ Implemented (RSA-2048 OAEP-SHA256) |
| macOS (Apple Si) | Secure Enclave (EC-P256)        | ✅ Implemented (EC-P256 ECIES)        |
| Other            | —                               | ❌ Unsupported                        |

Windows requires a real TPM 2.0; on hardware without one (e.g. CI runners),
`getProviderStatus()` throws `ProviderUnavailable`.

macOS requires Apple Silicon (or a T2-equipped Intel Mac) for the Secure Enclave.
Hosts without an SE get `ProviderUnavailable`.

> **macOS entitlement requirement.** Persisting a Secure Enclave key into the
> Keychain requires the host binary to be code-signed with an
> `application-identifier` entitlement. The shipped, code-signed `.app`
> satisfies this. Unsigned hosts (e.g. raw `cargo test` or `node` launched
> directly via `pnpm test`) hit `errSecMissingEntitlement` (-34018) on
> `createKey`; the test suites detect this and skip the provisioning paths.

## Installation

```sh
pnpm add @noem/platform-keystore
```

Requires Node >= 18.

The native binary ships in a per-platform subpackage
(`@noem/platform-keystore-win32-x64-msvc`, `…-win32-arm64-msvc`,
`…-darwin-arm64`) declared via `optionalDependencies`. Your package manager
fetches the one matching your host automatically — no flags needed.

Installing on an unsupported platform succeeds with no binary;
`require('@noem/platform-keystore')` then throws at load.

> [!NOTE]
> **Cross-platform bundling** (e.g. building a Windows artifact from a macOS
> host) needs npm's `--cpu` / `--os` overrides so npm fetches the foreign
> binary instead of filtering it out by host:
>
> ```sh
> npm install --cpu=x64 --os=win32 @noem/platform-keystore
> ```

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
type Backend = "ncrypt_tpm" | "macos_enclave";

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
  algorithm: string; // "RSA-2048" on Windows, "EC-P256-SE" on macOS
}

interface SealedBlob {
  ciphertext: string; // base64
  keyName: string;
  backend: Backend;
}
```

## Security notes

- Keys are **non-exportable** — the TPM and Secure Enclave both reject provisioning
  exportable keys; the public key never leaves the hardware in a usable form.
- The Rust side zeroes its plaintext copies on drop (`zeroize`). JS `Buffer`s **cannot** be
  reliably zeroed due to V8 GC — minimize their lifetime and avoid copying.
- `deleteKey` is destructive and irreversible.
- Sealed ciphertext is the caller's responsibility to store wherever (disk, settings DB,
  etc.). The backend only persists the hardware-bound key; it does not touch ciphertext
  at rest.

### Why `Buffer` and not `string` for plaintext?

`seal`/`unseal` take and return `Buffer` rather than `string`. This is deliberate:

- **V8 string hygiene is worse than `Buffer`.** JS strings are immutable, interned, and
  copied on concat/slice — a secret passed as `string` can sit in multiple V8 heap pages
  with no way to overwrite it. `Buffer` is backed by an `ArrayBuffer` whose bytes can at
  least be best-effort overwritten with `buf.fill(0)` before the reference is dropped
  (subject to the GC caveat above).
- **Plaintext is not always UTF-8.** The intended consumer (SQLCipher's `PRAGMA key`) accepts
  raw byte keys, not just passphrases. A `string` API would force hex/base64 round-trips at
  every call site and leak the secret into more V8 string slots along the way.
- **Ciphertext is a `string` on purpose.** `SealedBlob.ciphertext` is base64 — non-sensitive
  and meant to be JSON-serialized to disk, so a `string` is correct there.

If a caller knows their secret is UTF-8 text, wrap at the call site with
`Buffer.from(s, 'utf8')` / `buf.toString('utf8')` and drop the reference promptly.

## Development

```sh
pnpm build   # napi build (CJS + ESM) into dist/ — host triple
pnpm test    # vitest smoke tests + cargo llvm-cov (Rust unit tests w/ coverage)
pnpm lint    # biome + cargo fmt + clippy + tsc
```

The native crate is `noem-platform-keystore` (`Cargo.toml`); Rust sources live in `src/`.

### Release flow

Releases use [Changesets](https://github.com/changesets/changesets). After a
Version Packages PR merges, `.github/workflows/release.yml` matrix-builds the
crate on Windows + macOS runners (one job per `napi.targets` entry), uploads
each `.node`, then a publish job runs `napi pre-publish` to publish the per-
platform subpackages and `changeset publish` for the main package. The
matrix is generated dynamically from `packages-rust/*/package.json` by
`scripts/release-matrix.mts` — no per-package hardcoding in the workflow.

`build:ci` in `package.json` is the matrix-runner build entry (pins
`--target $TARGET`). Local dev uses the regular `build` script (host
triple only).

### Tests & coverage

The logic lives in the native addon, so the JS side has two roles:

- `test/smoke.test.ts` — **integration smoke test** of the built addon.
  The Windows TPM roundtrip only runs on real TPM 2.0 hardware; the macOS
  Secure Enclave roundtrip only runs when the host has the
  `application-identifier` entitlement (the shipped signed `.app`). Both
  arms detect the unavailable case and assert the documented error path
  instead.
- `#[cfg(test)]` **Rust unit tests** in `src/` exercise the per-platform logic
  directly. `build.rs` adds link-args so the test binary links despite the napi
  glue referencing symbols Node provides at runtime.

`pnpm test` runs `cargo llvm-cov` after vitest: it builds the instrumented
tests, writes an HTML report to `coverage/html/index.html`, and prints a text
summary to stdout. JS-side coverage is disabled in `vitest.config.ts` — the
addon's behavior is covered by the Rust tests. The NCrypt paths
(`src/windows/`) are covered only on Windows with a TPM; the Secure Enclave
provisioning paths (`src/macos/enclave.rs`) are covered only when the
running test binary has the entitlement to persist SE keys.
