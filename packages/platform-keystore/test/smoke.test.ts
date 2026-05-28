import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';

import {
  createKey,
  deleteKey,
  getProviderStatus,
  getProviderStatusSync,
  keyExists,
  seal,
  unseal,
} from '../dist/index.js';

const platform = process.platform;
const isMac = platform === 'darwin';
const isWindows = platform === 'win32';

console.info(`Running tests for platform: ${platform}`);

test('getProviderStatus reports a backend on supported platforms', async () => {
  if (isMac) {
    const status = await getProviderStatus();
    expect(status.available).toBe(true);
    expect(status.backend).toBe('macos_keychain');

    // The blocking sync variant returns the same result.
    expect(getProviderStatusSync().backend).toBe('macos_keychain');
    return;
  }

  if (isWindows) {
    // CI-hosted Windows runners have no hardware TPM, so the Platform Crypto
    // Provider fails to load and getProviderStatus() rejects with
    // ProviderUnavailable. On real hardware with a TPM 2.0, it reports the
    // ncrypt_tpm backend. Accept either outcome.
    try {
      const status = await getProviderStatus();
      expect(status.available).toBe(true);
      expect(status.backend).toBe('ncrypt_tpm');

      console.info('TPM Available tests');
    } catch (err) {
      expect((err as Error).message).toMatch(/provider not available/i);
      console.info('TPM Not Available tests');
    }
    return;
  }

  console.info('TPM Error tests');
  await expect(getProviderStatus()).rejects.toThrow();
});

test('seal/unseal roundtrip stores and reads back a secret', async () => {
  if (isMac) {
    // macOS is a dev stub: createKey returns metadata but stores nothing,
    // keyExists is always false, and seal/unseal are not yet implemented.
    // Assert that contract so this test flips when the backend lands.
    const keyName = `noem-test-${randomUUID()}`;
    const info = await createKey(keyName);
    expect(info.backend).toBe('macos_keychain');
    expect(info.exportable).toBe(false);
    expect(info.algorithm).toBe('EC-P256-SE');

    expect(await keyExists(keyName)).toBe(false);
    await expect(seal(keyName, Buffer.from('secret', 'utf8'))).rejects.toThrow(
      /not yet implemented/i,
    );
    return;
  }

  if (isWindows) {
    // Real roundtrip only runs on hardware with a TPM 2.0. CI-hosted Windows
    // runners have no TPM, so the provider rejects with ProviderUnavailable.
    try {
      const keyName = `noem-test-${randomUUID()}`;
      // ~28 bytes — fits a single RSA-2048 OAEP-SHA256 operation (~190B cap)
      // and matches the intended DB-password use case.
      const secret = 'correct-horse-battery-staple';

      try {
        await createKey(keyName);
        expect(await keyExists(keyName)).toBe(true);

        const blob = await seal(keyName, Buffer.from(secret, 'utf8'));
        expect(blob.keyName).toBe(keyName);
        expect(blob.backend).toBe('ncrypt_tpm');
        expect(blob.ciphertext.length).toBeGreaterThan(0);

        const out = await unseal(keyName, blob);
        expect(Buffer.from(out).toString('utf8')).toBe(secret);

        // One key seals many independent secrets.
        const blob2 = await seal(keyName, Buffer.from('secret', 'utf8'));
        expect(blob2.keyName).toBe(keyName);
        expect(blob2.backend).toBe('ncrypt_tpm');
        expect(blob2.ciphertext.length).toBeGreaterThan(0);

        const out2 = await unseal(keyName, blob2);
        expect(Buffer.from(out2).toString('utf8')).toBe('secret');

        console.info('TPM Available roundtrip');
      } finally {
        // Best-effort cleanup so the test leaves no provisioned key behind,
        // even if an assertion above failed.
        try {
          await deleteKey(keyName);
        } catch {
          /* key may not have been created — ignore */
        }
      }
    } catch (err) {
      expect((err as Error).message).toMatch(/provider not available/i);
      console.info('TPM Not Available roundtrip');
    }
    return;
  }

  console.info('TPM Error roundtrip');
  await expect(createKey(`noem-test-${randomUUID()}`)).rejects.toThrow();
  // 30s ceiling: on real TPM hardware createKey triggers RSA-2048 keygen
  // (seconds) plus repeated provider opens — well past vitest's 5s default.
}, 30_000);
