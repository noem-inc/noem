import { expect, test } from 'vitest';

import { getProviderStatus } from '../dist/index.js';

const platform = process.platform;
const isMac = platform === 'darwin';
const isWindows = platform === 'win32';

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
    } catch (err) {
      expect((err as Error).message).toMatch(/provider not available/i);
    }
    return;
  }

  expect(() => getProviderStatus()).toThrow();
});
