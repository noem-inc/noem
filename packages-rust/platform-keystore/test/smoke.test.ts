import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';

import {
  createKey,
  createKeySync,
  deleteKey,
  deleteKeySync,
  getProviderStatus,
  getProviderStatusSync,
  keyExists,
  keyExistsSync,
  seal,
  sealSync,
  unseal,
  unsealSync,
} from '../dist/index.js';

const platform = process.platform;
const isMac = platform === 'darwin';
const isWindows = platform === 'win32';
const isUnsupported = !isMac && !isWindows;

console.info(`Running tests for platform: ${platform}`);

describe('#getProviderStatus', () => {
  test.runIf(isMac)('reports macos_enclave backend on mac', async () => {
    const status = await getProviderStatus();
    expect(status.available).toBe(true);
    expect(status.backend).toBe('macos_enclave');

    // The blocking sync variant returns the same result.
    expect(getProviderStatusSync().backend).toBe('macos_enclave');
  });

  test.runIf(isWindows)(
    'reports ncrypt_tpm backend on windows (or ProviderUnavailable without TPM)',
    async () => {
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
    },
  );

  test.runIf(isUnsupported)('throws on unsupported platform', async () => {
    console.info('TPM Error tests');
    await expect(getProviderStatus()).rejects.toThrow();
  });
});

describe('#getProviderStatusSync', () => {
  test.runIf(isMac)('reports macos_enclave backend on mac sync', () => {
    const status = getProviderStatusSync();
    expect(status.available).toBe(true);
    expect(status.backend).toBe('macos_enclave');

    // The blocking sync variant returns the same result.
    expect(getProviderStatusSync().backend).toBe('macos_enclave');
  });

  test.runIf(isWindows)(
    'reports ncrypt_tpm backend on windows sync (or ProviderUnavailable without TPM)',
    () => {
      // CI-hosted Windows runners have no hardware TPM, so the Platform Crypto
      // Provider fails to load and getProviderStatus() rejects with
      // ProviderUnavailable. On real hardware with a TPM 2.0, it reports the
      // ncrypt_tpm backend. Accept either outcome.
      try {
        const status = getProviderStatusSync();
        expect(status.available).toBe(true);
        expect(status.backend).toBe('ncrypt_tpm');

        console.info('TPM Available tests');
      } catch (err) {
        expect((err as Error).message).toMatch(/provider not available/i);
        console.info('TPM Not Available tests');
      }
    },
  );

  test.runIf(isUnsupported)('throws on unsupported platform sync', () => {
    console.info('TPM Error tests');
    expect(() => getProviderStatusSync()).toThrow();
  });
});

// 30s ceiling: on real TPM hardware createKey triggers RSA-2048 keygen
// (seconds) plus repeated provider opens — well past vitest's 5s default.
const ROUNDTRIP_TIMEOUT_MS = 30_000;

test.runIf(isMac)(
  'sync seal/unseal roundtrip on macos enclave',
  () => {
    // Real Secure Enclave roundtrip — only runs when the host binary has the
    // application-identifier entitlement required to persist SE keys. Node
    // launched via `pnpm test` is typically unsigned in that sense, so
    // createKey rejects with errSecMissingEntitlement (-34018). Accept that
    // skip path; the shipped signed `.app` exercises the full roundtrip.
    const keyName = `noem-test-${randomUUID()}`;
    const secret = 'correct-horse-battery-staple';
    try {
      try {
        const info = createKeySync(keyName);
        expect(info.backend).toBe('macos_enclave');
        expect(info.exportable).toBe(false);
        expect(info.algorithm).toBe('EC-P256-SE');
        expect(keyExistsSync(keyName)).toBe(true);

        const blob = sealSync(keyName, Buffer.from(secret, 'utf8'));
        expect(blob.keyName).toBe(keyName);
        expect(blob.backend).toBe('macos_enclave');
        expect(blob.ciphertext.length).toBeGreaterThan(0);

        const out = unsealSync(keyName, blob);
        expect(Buffer.from(out).toString('utf8')).toBe(secret);

        // One key seals many independent secrets.
        const blob2 = sealSync(keyName, Buffer.from('secret', 'utf8'));
        const out2 = unsealSync(keyName, blob2);
        expect(Buffer.from(out2).toString('utf8')).toBe('secret');

        console.info('Secure Enclave Available roundtrip');
      } finally {
        try {
          deleteKeySync(keyName);
        } catch {
          /* key may not have been created — ignore */
        }
      }
    } catch (err) {
      expect((err as Error).message).toMatch(/-34018|missingentitlement/i);
      console.info(
        'Secure Enclave Not Available (unsigned host) — skipping roundtrip',
      );
    }
  },
  ROUNDTRIP_TIMEOUT_MS,
);

test.runIf(isWindows)(
  'sync seal/unseal roundtrip on windows tpm',
  () => {
    // Real roundtrip only runs on hardware with a TPM 2.0. CI-hosted Windows
    // runners have no TPM, so the provider rejects with ProviderUnavailable.
    try {
      const keyName = `noem-test-${randomUUID()}`;
      // ~28 bytes — fits a single RSA-2048 OAEP-SHA256 operation (~190B cap)
      // and matches the intended DB-password use case.
      const secret = 'correct-horse-battery-staple';

      try {
        createKeySync(keyName);
        expect(keyExistsSync(keyName)).toBe(true);

        const blob = sealSync(keyName, Buffer.from(secret, 'utf8'));
        expect(blob.keyName).toBe(keyName);
        expect(blob.backend).toBe('ncrypt_tpm');
        expect(blob.ciphertext.length).toBeGreaterThan(0);

        const out = unsealSync(keyName, blob);
        expect(Buffer.from(out).toString('utf8')).toBe(secret);

        // One key seals many independent secrets.
        const blob2 = sealSync(keyName, Buffer.from('secret', 'utf8'));
        expect(blob2.keyName).toBe(keyName);
        expect(blob2.backend).toBe('ncrypt_tpm');
        expect(blob2.ciphertext.length).toBeGreaterThan(0);

        const out2 = unsealSync(keyName, blob2);
        expect(Buffer.from(out2).toString('utf8')).toBe('secret');

        console.info('TPM Available roundtrip');
      } finally {
        // Best-effort cleanup so the test leaves no provisioned key behind,
        // even if an assertion above failed.
        try {
          deleteKeySync(keyName);
        } catch {
          /* key may not have been created — ignore */
        }
      }
    } catch (err) {
      expect((err as Error).message).toMatch(/provider not available/i);
      console.info('TPM Not Available roundtrip');
    }
  },
  ROUNDTRIP_TIMEOUT_MS,
);

test.runIf(isUnsupported)(
  'sync createKey throws on unsupported platform',
  () => {
    console.info('TPM Error roundtrip');
    expect(() => createKeySync(`noem-test-${randomUUID()}`)).toThrow();
  },
  ROUNDTRIP_TIMEOUT_MS,
);

test.runIf(isMac)(
  'async seal/unseal roundtrip on macos enclave',
  async () => {
    // Real Secure Enclave roundtrip — only runs when the host binary has the
    // application-identifier entitlement required to persist SE keys. Node
    // launched via `pnpm test` is typically unsigned in that sense, so
    // createKey rejects with errSecMissingEntitlement (-34018). Accept that
    // skip path; the shipped signed `.app` exercises the full roundtrip.
    const keyName = `noem-test-${randomUUID()}`;
    const secret = 'correct-horse-battery-staple';
    try {
      try {
        const info = await createKey(keyName);
        expect(info.backend).toBe('macos_enclave');
        expect(info.exportable).toBe(false);
        expect(info.algorithm).toBe('EC-P256-SE');
        expect(await keyExists(keyName)).toBe(true);

        const blob = await seal(keyName, Buffer.from(secret, 'utf8'));
        expect(blob.keyName).toBe(keyName);
        expect(blob.backend).toBe('macos_enclave');
        expect(blob.ciphertext.length).toBeGreaterThan(0);

        const out = await unseal(keyName, blob);
        expect(Buffer.from(out).toString('utf8')).toBe(secret);

        // One key seals many independent secrets.
        const blob2 = await seal(keyName, Buffer.from('secret', 'utf8'));
        const out2 = await unseal(keyName, blob2);
        expect(Buffer.from(out2).toString('utf8')).toBe('secret');

        console.info('Secure Enclave Available roundtrip');
      } finally {
        try {
          await deleteKey(keyName);
        } catch {
          /* key may not have been created — ignore */
        }
      }
    } catch (err) {
      expect((err as Error).message).toMatch(/-34018|missingentitlement/i);
      console.info(
        'Secure Enclave Not Available (unsigned host) — skipping roundtrip',
      );
    }
  },
  ROUNDTRIP_TIMEOUT_MS,
);

test.runIf(isWindows)(
  'async seal/unseal roundtrip on windows tpm',
  async () => {
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
  },
  ROUNDTRIP_TIMEOUT_MS,
);

test.runIf(isUnsupported)(
  'async createKey rejects on unsupported platform',
  async () => {
    console.info('TPM Error roundtrip');
    await expect(createKey(`noem-test-${randomUUID()}`)).rejects.toThrow();
  },
  ROUNDTRIP_TIMEOUT_MS,
);
