import { expect, test } from 'vitest';

import { getProviderStatus } from '../dist/index.js';

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
