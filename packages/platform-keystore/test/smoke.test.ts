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
    const status = getProviderStatus();
    expect(status.available).toBe(true);
    expect(status.backend).toBe('ncrypt_tpm');
    return;
  }

  expect(() => getProviderStatus()).toThrow();
});
