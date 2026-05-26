import { describe, expect, it } from 'vitest';

import {
  type EncryptedDataEnvelope,
  EncryptionService,
} from './encryption.service.js';
import type { EncryptionKeysInputType } from './schemas.js';

function makeKey(fill: number): string {
  return Buffer.from(new Uint8Array(32).fill(fill)).toString('base64');
}

const KEYS: EncryptionKeysInputType = {
  currentKid: 'k2',
  keys: [
    {
      alg: 'AES-GCM',
      kid: 'k1',
      base64Key: makeKey(1),
    },
    {
      alg: 'AES-GCM',
      kid: 'k2',
      base64Key: makeKey(2),
    },
  ],
};

const AAD = 'tenant42:users:ssn';

describe('EncryptionService', () => {
  it('round-trips plaintext', async () => {
    const svc = new EncryptionService(KEYS);
    const env = await svc.encryptData('secret-value', AAD);

    expect(env.kid).toBe('k2');
    expect(env.ct).not.toBe('secret-value');
    expect(await svc.decryptData(env, AAD)).toBe('secret-value');
  });

  it('no keys provided and no env variable should throw error', async () => {
    try {
      new EncryptionService();
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('no keys provided should fallback to env variable', async () => {
    process.env.NOEM_ENCRYPTION_KEYS = JSON.stringify(KEYS);

    const svc = new EncryptionService();
    const env = await svc.encryptData('secret-value', AAD);

    expect(env.kid).toBe('k2');
    expect(env.ct).not.toBe('secret-value');
    expect(await svc.decryptData(env, AAD)).toBe('secret-value');
  });

  it('encrypts under currentKid and decrypts after rotation', async () => {
    const svc = new EncryptionService(KEYS);
    const env = await svc.encryptData('hello', AAD);
    expect(env.kid).toBe('k2');

    // Rotate currentKid; the old envelope still decrypts via its own kid.
    const rotated = new EncryptionService({ ...KEYS, currentKid: 'k1' });
    expect(await rotated.decryptData(env, AAD)).toBe('hello');
    expect((await rotated.encryptData('hello', AAD)).kid).toBe('k1');
  });

  it('fails to decrypt with the wrong AAD', async () => {
    const svc = new EncryptionService(KEYS);
    const env = await svc.encryptData('secret', AAD);

    await expect(
      svc.decryptData(env, 'tenant42:users:email'),
    ).rejects.toThrow();
  });

  it('fails to decrypt tampered ciphertext', async () => {
    const svc = new EncryptionService(KEYS);
    const env = await svc.encryptData('secret', AAD);

    const bytes = Buffer.from(env.ct, 'base64');
    bytes[0] ^= 0xff;
    const tampered: EncryptedDataEnvelope = {
      ...env,
      ct: bytes.toString('base64'),
    };

    await expect(svc.decryptData(tampered, AAD)).rejects.toThrow();
  });

  it('rejects an envelope with a bad IV length', async () => {
    const svc = new EncryptionService(KEYS);
    const env = await svc.encryptData('secret', AAD);

    const badIv: EncryptedDataEnvelope = {
      ...env,
      iv: Buffer.from(new Uint8Array(8)).toString('base64'), // 8 bytes, not 12
    };

    await expect(svc.decryptData(badIv, AAD)).rejects.toThrow();
  });

  it('rejects an unknown kid', async () => {
    const svc = new EncryptionService(KEYS);
    const env = await svc.encryptData('secret', AAD);

    await expect(
      svc.decryptData({ ...env, kid: 'does-not-exist' }, AAD),
    ).rejects.toThrow(/No key found/);
  });

  describe('disabled mode', () => {
    it('passes plaintext through on encrypt', async () => {
      const svc = new EncryptionService(KEYS, false);
      const env = await svc.encryptData('plain', AAD);

      expect(env.kid).toBe('_none_');
      expect(env.ct).toBe('plain');
    });

    it('returns the _none_ envelope verbatim on decrypt', async () => {
      const svc = new EncryptionService(KEYS, false);
      const env = await svc.encryptData('plain', AAD);

      expect(await svc.decryptData(env, AAD)).toBe('plain');
    });

    it('still decrypts existing ciphertext (disabled only stops new encryption)', async () => {
      const enabled = new EncryptionService(KEYS);
      const env = await enabled.encryptData('secret', AAD);

      const disabled = new EncryptionService(KEYS, false);
      expect(await disabled.decryptData(env, AAD)).toBe('secret');
    });

    it('refuses a _none_ envelope when encryption is enabled', async () => {
      const enabled = new EncryptionService(KEYS);

      await expect(
        enabled.decryptData({ kid: '_none_', ct: 'plain', iv: '' }, AAD),
      ).rejects.toThrow();
    });
  });
});
