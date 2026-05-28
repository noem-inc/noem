# @noem/encryption

[![Release](https://github.com/noem-inc/noem/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/noem-inc/noem/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/@noem/encryption.svg)](https://www.npmjs.com/package/@noem/encryption)
[![Security: Trusted Publisher](https://img.shields.io/badge/security-trusted--publisher-green?logo=github)](https://www.npmjs.com/package/@noem/encryption)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Field-level encryption helper built on WebCrypto AES-256-GCM. Produces a
self-describing envelope (`kid` + ciphertext + IV) that is safe to store in a
database column. ESM/CJS and isomorphic — runs in Node 18+, browsers, and edge
runtimes (no Node `Buffer`).

## Install

```bash
pnpm add @noem/encryption
```

## Usage

```ts
import { EncryptionService } from "@noem/encryption";

const svc = new EncryptionService({
  currentKid: "k1",
  keys: [
    {
      alg: "AES-GCM",
      kid: "k1",
      base64Key: "<base64 of 32 random bytes>",
    },
  ],
});

// `aad` (Additional Authenticated Data) binds the ciphertext to its context.
// The exact same value must be passed to decrypt or it fails.
const aad = "tenant42:users:ssn";

const envelope = await svc.encryptData("123-45-6789", aad);
// { kid: 'k1', ct: '<base64>', iv: '<base64>' } — store this

const plain = await svc.decryptData(envelope, aad); // '123-45-6789'
```

`encryptData` takes a string; cast non-strings before passing them in.

## Envelope

```ts
type EncryptedDataEnvelope = {
  kid: string; // key id used, so the right key is picked at decrypt time
  ct: string; // base64 ciphertext (includes the GCM auth tag)
  iv: string; // base64 IV, always 12 bytes (NIST SP 800-38D)
};
```

## Keys

Keys are validated with [valibot](https://valibot.dev) on construction:

```ts
type EncryptionKeysInput = {
  currentKid: string; // must match a kid in `keys`
  keys: Array<{
    alg: "AES-GCM"; // only AES-GCM is supported
    kid: string; // non-empty
    base64Key: string; // base64 of exactly 32 bytes (AES-256)
  }>;
};
```

Generate a key:

```bash
node -e "console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'))"
```

If no keys are passed to the constructor, the service falls back to the
`NOEM_ENCRYPTION_KEYS` env var (a JSON string of the shape above).

### Rotation

`encryptData` always uses `currentKid`. `decryptData` looks up the key by the
envelope's own `kid`, so old envelopes keep decrypting after you rotate. To
rotate: add a new key, point `currentKid` at it, and keep the old keys around
for existing data.

## Disabled mode

```ts
new EncryptionService(keys, false);
```

When disabled, `encryptData` returns plaintext under a `_none_` kid and
`decryptData` returns it verbatim. Existing real ciphertext still decrypts; an
encryption-enabled service refuses to decrypt a `_none_` envelope.

> **Warning:** Disabling encryption is extremely dangerous. Never set this in
> production.

## Security notes

- AES-256-GCM is authenticated: tampering with `ct`, `iv`, `kid`, or `aad`
  makes decryption throw.
- A fresh random 12-byte IV is generated per encryption.
- `aad` is not stored in the envelope — the caller must supply the same value
  at decrypt time (e.g. a stable `tenant:table:field` identifier).
- Imported `CryptoKey`s are cached per `kid` and not exportable.

## Scripts

```bash
pnpm test   # vitest + coverage
pnpm build  # tsc -> dist
pnpm lint   # biome
```
