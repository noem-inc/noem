import * as v from 'valibot';

import { fromBase64, toBase64 } from './base64.js';
import {
  EncryptedDataEnvelopeSchema,
  type EncryptionKeysInputType,
  type EncryptionKeysOutputType,
  EncryptionKeysSchema,
  IV_BYTE_LENGTH,
  type SingleEncryptionKeyOutputType,
} from './schemas.js';

const NO_ENCRYPTION_KID = '_none_';

export type EncryptedDataEnvelope = {
  kid: string;
  ct: string;
  iv: string;
};

const getProcessEnvKeysFallback = () => {
  if (typeof process?.env === 'undefined') {
    return undefined;
  }

  return process.env.NOEM_ENCRYPTION_KEYS;
};

export class EncryptionService {
  private readonly encryptionKeys: EncryptionKeysOutputType;
  private readonly isEncryptionEnabled: boolean;

  /** Imported `CryptoKey`s cached by kid (promises, to dedupe concurrent imports). */
  private readonly cryptoKeyCache = new Map<string, Promise<CryptoKey>>();

  private readonly textEncoder = new TextEncoder();
  private readonly textDecoder = new TextDecoder();

  constructor(
    localEncryptionKeys?: EncryptionKeysInputType,
    localIsEncryptionEnable?: boolean,
  ) {
    if (!localEncryptionKeys) {
      console.info(
        'No keys provided, falling back to process.env.NOEM_ENCRYPTION_KEYS',
      );

      localEncryptionKeys = JSON.parse(getProcessEnvKeysFallback() || '{}');
    }

    this.encryptionKeys = v.parse(EncryptionKeysSchema, localEncryptionKeys);

    if (typeof localIsEncryptionEnable !== 'boolean') {
      localIsEncryptionEnable = true;
    }

    this.isEncryptionEnabled = localIsEncryptionEnable;

    if (!this.isEncryptionEnabled) {
      console.warn(
        'Encryption is disabled — this is extremely dangerous and must never be set in production.',
      );
    }
  }

  /**
   * Encrypts the passed in data with the required authentication data. This will return an envelope with the data.
   * The envelope is safe to store in database for field-level encryption.
   *
   * @param data The string to be encrypted, if a non-string needs to be encrypted then cast it to string.
   * @param aad The Additional Authenticated Data for uniqueness. The exact same value needs to be passed
   *            in to the decryptData function.
   * @returns A promise wrapping the encryption algorythm
   */
  async encryptData(data: string, aad: string): Promise<EncryptedDataEnvelope> {
    if (!this.isEncryptionEnabled) {
      return {
        kid: NO_ENCRYPTION_KID,
        ct: data,
        iv: '',
      };
    }

    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
    const currentKey = this.getCurrentKey();
    const cryptoKey = await this.getCryptoKey(currentKey);

    const ct = await crypto.subtle.encrypt(
      {
        name: currentKey.alg,
        iv,
        additionalData: this.textEncoder.encode(aad),
      },
      cryptoKey,
      this.textEncoder.encode(data),
    );

    return {
      kid: currentKey.kid,
      ct: toBase64(new Uint8Array(ct)),
      iv: toBase64(iv),
    };
  }

  /**
   * Decrypts an envelope. `aad` must exactly match the value used at encrypt
   * time or decryption fails (integrity check). WebCrypto verifies the auth
   * tag and throws on any tampering.
   */
  async decryptData(
    envelope: EncryptedDataEnvelope,
    aad: string,
  ): Promise<string> {
    if (envelope.kid === NO_ENCRYPTION_KID) {
      if (this.isEncryptionEnabled) {
        throw new Error(
          'Envelope uses the no-encryption KID in an encryption-enabled environment — refusing to decrypt.',
        );
      }

      // Encryption disabled: the value was never encrypted, return it as-is.
      return envelope.ct;
    }

    const parsed = v.parse(EncryptedDataEnvelopeSchema, envelope);

    const key = this.getKey(parsed.kid);
    if (!key) {
      throw new Error(`No key found for the kid=(${parsed.kid})`);
    }

    const cryptoKey = await this.getCryptoKey(key);

    const plain = await crypto.subtle.decrypt(
      {
        name: key.alg,
        iv: fromBase64(parsed.iv),
        additionalData: this.textEncoder.encode(aad),
      },
      cryptoKey,
      fromBase64(parsed.ct),
    );

    return this.textDecoder.decode(plain);
  }

  private getCryptoKey(key: SingleEncryptionKeyOutputType): Promise<CryptoKey> {
    let cached = this.cryptoKeyCache.get(key.kid);
    if (!cached) {
      cached = crypto.subtle.importKey('raw', key.key, key.alg, false, [
        'encrypt',
        'decrypt',
      ]);
      this.cryptoKeyCache.set(key.kid, cached);
    }
    return cached;
  }

  private getCurrentKey(): SingleEncryptionKeyOutputType {
    return this.getKey(
      this.encryptionKeys.currentKid,
    ) as SingleEncryptionKeyOutputType;
  }

  private getKey(kid: string): SingleEncryptionKeyOutputType | undefined {
    return this.encryptionKeys.keys.find((key) => key.kid === kid);
  }
}
