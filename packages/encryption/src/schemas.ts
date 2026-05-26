import * as v from 'valibot';

import { fromBase64 } from './base64.js';

/**
 * AES-256-GCM always uses a 12-byte IV per NIST SP 800-38D.
 */
export const IV_BYTE_LENGTH = 12;

/**
 * The supported cipher algorithms, named exactly as WebCrypto expects them so
 * the value passes straight into `crypto.subtle` with no mapping. We only
 * support AES-GCM (with a 256-bit key, enforced via the key-length check).
 */
const SUPPORTED_ALGS = ['AES-GCM'] as const;

const SingleEncryptionKeySchema = v.pipe(
  v.object({
    alg: v.picklist(SUPPORTED_ALGS),
    kid: v.pipe(v.string(), v.nonEmpty()),
    base64Key: v.pipe(v.string(), v.nonEmpty(), v.base64()),
  }),
  v.transform((input) => {
    return {
      alg: input.alg,
      kid: input.kid,
      key: fromBase64(input.base64Key),
    };
  }),
  v.check(
    // AES-256 requires a 32-byte key. The alg name ('AES-GCM') does not encode
    // the key size, so the byte length is what pins this to AES-256.
    (input) => input.key.length === 32,
    'Key length does not match algorithm requirements (AES-256 needs 32 bytes)',
  ),
);

export const EncryptionKeysSchema = v.pipe(
  v.object({
    currentKid: v.pipe(v.string(), v.nonEmpty()),
    keys: v.pipe(v.array(SingleEncryptionKeySchema), v.minLength(1)),
  }),
  v.check((input) => {
    const currentKid = input.currentKid;

    return input.keys.some((key) => key.kid === currentKid);
  }, `There must be a key with a 'kid' matching 'currentKid'`),
);

/**
 * Validates an untrusted decrypt envelope (real-ciphertext path only). The IV
 * length check is part of the security boundary — the auth tag is enforced by
 * WebCrypto itself, which rejects anything but the full 16-byte tag.
 */
export const EncryptedDataEnvelopeSchema = v.object({
  kid: v.pipe(v.string(), v.nonEmpty()),
  ct: v.pipe(v.string(), v.nonEmpty(), v.base64()),
  iv: v.pipe(
    v.string(),
    v.nonEmpty(),
    v.base64(),
    v.check(
      (iv) => fromBase64(iv).length === IV_BYTE_LENGTH,
      `IV must decode to exactly ${IV_BYTE_LENGTH} bytes`,
    ),
  ),
});

export type EncryptionKeysInputType = v.InferInput<typeof EncryptionKeysSchema>;
export type EncryptionKeysOutputType = v.InferOutput<
  typeof EncryptionKeysSchema
>;
export type SingleEncryptionKeyOutputType = v.InferOutput<
  typeof SingleEncryptionKeySchema
>;
