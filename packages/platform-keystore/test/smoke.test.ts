import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';

import {
  createKey,
  deleteKey,
  getProviderStatus,
  keyExists,
  seal,
  unseal,
} from '../dist/index.js';

const platform = process.platform;
const isMac = platform === 'darwin';
const isWindows = platform === 'win32';

console.info(`Running tests for platform: ${platform}`);

test('getProviderStatus reports a backend on supported platforms', () => {
  if (isMac) {
    const status = getProviderStatus();
    expect(status.available).toBe(true);
    expect(status.backend).toBe('macos_keychain');
    return;
  }

  if (isWindows) {
    // CI-hosted Windows runners have no hardware TPM, so the Platform Crypto
    // Provider fails to load and getProviderStatus() throws ProviderUnavailable.
    // On real hardware with a TPM 2.0, it reports the ncrypt_tpm backend.
    // Accept either outcome.
    try {
      const status = getProviderStatus();
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
  expect(() => getProviderStatus()).toThrow();
});

test('seal/unseal roundtrip stores and reads back a secret', () => {
  if (isMac) {
    // macOS is a dev stub: createKey returns metadata but stores nothing,
    // keyExists is always false, and seal/unseal are not yet implemented.
    // Assert that contract so this test flips when the backend lands.
    const keyName = `noem-test-${randomUUID()}`;
    const info = createKey(keyName);
    expect(info.backend).toBe('macos_keychain');
    expect(info.exportable).toBe(false);
    expect(info.algorithm).toBe('EC-P256-SE');

    expect(keyExists(keyName)).toBe(false);
    expect(() => seal(keyName, Buffer.from('secret', 'utf8'))).toThrow(
      /not yet implemented/i,
    );
    return;
  }

  if (isWindows) {
    // Real roundtrip only runs on hardware with a TPM 2.0. CI-hosted Windows
    // runners have no TPM, so the provider throws ProviderUnavailable.
    try {
      const keyName = `noem-test-${randomUUID()}`;
      // ~28 bytes — fits a single RSA-2048 OAEP-SHA256 operation (~190B cap)
      // and matches the intended DB-password use case.
      const secret = 'correct-horse-battery-staple';

      try {
        createKey(keyName);
        expect(keyExists(keyName)).toBe(true);

        const blob = seal(keyName, Buffer.from(secret, 'utf8'));
        expect(blob.keyName).toBe(keyName);
        expect(blob.backend).toBe('ncrypt_tpm');
        expect(blob.ciphertext.length).toBeGreaterThan(0);

        const out = unseal(keyName, blob);
        expect(Buffer.from(out).toString('utf8')).toBe(secret);

        console.info('TPM Available roundtrip');
      } finally {
        // Best-effort cleanup so the test leaves no provisioned key behind,
        // even if an assertion above failed.
        try {
          deleteKey(keyName);
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
  expect(() => createKey(`noem-test-${randomUUID()}`)).toThrow();
});
