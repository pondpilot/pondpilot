import { webcrypto } from 'crypto';

import { describe, it, expect, beforeAll } from '@jest/globals';

import {
  bufferToBase64,
  base64ToBuffer,
  encrypt,
  decrypt,
} from '../../../src/services/secret-store';

// Node.js provides Web Crypto via `webcrypto`; make it available globally
// so the encrypt/decrypt helpers can use `crypto.subtle`.
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = webcrypto;
}

describe('secret-store', () => {
  describe('bufferToBase64 / base64ToBuffer roundtrip', () => {
    it('should roundtrip an empty buffer', () => {
      const buf = new ArrayBuffer(0);
      const b64 = bufferToBase64(buf);
      const result = base64ToBuffer(b64);
      expect(result.byteLength).toBe(0);
    });

    it('should roundtrip a known byte sequence', () => {
      const original = new Uint8Array([0, 1, 2, 127, 128, 255]);
      const b64 = bufferToBase64(original.buffer);
      const result = new Uint8Array(base64ToBuffer(b64));
      expect(result).toEqual(original);
    });

    it('should roundtrip a large buffer', () => {
      const original = new Uint8Array(1024);
      for (let i = 0; i < original.length; i += 1) {
        original[i] = i % 256;
      }
      const b64 = bufferToBase64(original.buffer);
      const result = new Uint8Array(base64ToBuffer(b64));
      expect(result).toEqual(original);
    });

    it('should throw for buffers exceeding 65 KB', () => {
      const oversized = new ArrayBuffer(65_537);
      expect(() => bufferToBase64(oversized)).toThrow(/exceeds maximum/);
    });
  });

  describe('encrypt / decrypt roundtrip', () => {
    let key: CryptoKey;

    beforeAll(async () => {
      key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ]);
    });

    it('should encrypt and decrypt a simple string', async () => {
      const plaintext = 'hello, secret world!';
      const encrypted = await encrypt(key, plaintext);

      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      // Ciphertext should not equal plaintext
      expect(encrypted.ciphertext).not.toBe(plaintext);

      const decrypted = await decrypt(key, encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt an empty string', async () => {
      const plaintext = '';
      const encrypted = await encrypt(key, plaintext);
      const decrypted = await decrypt(key, encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt a JSON payload', async () => {
      const data = { clientId: 'test-id', clientSecret: 'super-secret', token: '' };
      const plaintext = JSON.stringify(data);
      const encrypted = await encrypt(key, plaintext);
      const decrypted = await decrypt(key, encrypted);
      expect(JSON.parse(decrypted)).toEqual(data);
    });

    it('should produce different ciphertexts for the same plaintext (unique IVs)', async () => {
      const plaintext = 'same input';
      const enc1 = await encrypt(key, plaintext);
      const enc2 = await encrypt(key, plaintext);

      expect(enc1.iv).not.toBe(enc2.iv);
      expect(enc1.ciphertext).not.toBe(enc2.ciphertext);

      // Both should decrypt to the same value
      expect(await decrypt(key, enc1)).toBe(plaintext);
      expect(await decrypt(key, enc2)).toBe(plaintext);
    });

    it('should fail to decrypt with a different key', async () => {
      const otherKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ]);

      const encrypted = await encrypt(key, 'secret data');

      await expect(decrypt(otherKey, encrypted)).rejects.toThrow();
    });

    it('should fail to decrypt corrupted ciphertext', async () => {
      const encrypted = await encrypt(key, 'valid data');

      // Corrupt the ciphertext by replacing part of it
      const corrupted = {
        ...encrypted,
        ciphertext: `${encrypted.ciphertext.slice(0, -4)}XXXX`,
      };

      await expect(decrypt(key, corrupted)).rejects.toThrow();
    });
  });
});
