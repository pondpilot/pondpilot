import { isTauriEnvironment } from '@utils/browser';

/**
 * Browser-based credential storage for WASM environment
 * Stores database credentials in localStorage with basic encryption
 */
export class BrowserCredentialStore {
  private static STORAGE_KEY = 'pondpilot_credentials';
  private static KEY_STORAGE_KEY = 'pondpilot_credentials_key';
  private static cryptoKeyPromise: Promise<CryptoKey> | null = null;

  /**
   * Save credentials for a connection
   * @param connectionId - The connection ID
   * @param credentials - The credentials to store
   */
  static async save(connectionId: string, credentials: any): Promise<void> {
    if (isTauriEnvironment()) {
      throw new Error('Use backend credential storage in Tauri environment');
    }

    const stored = this.getAll();
    stored[connectionId] = {
      ...credentials,
      // Encrypt sensitive fields before storing
      password: credentials.password ? await this.encrypt(credentials.password) : undefined,
    };

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stored));
  }

  /**
   * Get credentials for a connection
   * @param connectionId - The connection ID
   * @returns The credentials or null if not found
   */
  static async get(connectionId: string): Promise<any | null> {
    if (isTauriEnvironment()) {
      throw new Error('Use backend credential storage in Tauri environment');
    }

    const stored = this.getAll();
    const creds = stored[connectionId];

    if (!creds) return null;

    return {
      ...creds,
      password: creds.password ? await this.decrypt(creds.password) : undefined,
    };
  }

  /**
   * Delete credentials for a connection
   * @param connectionId - The connection ID
   */
  static async delete(connectionId: string): Promise<void> {
    if (isTauriEnvironment()) {
      throw new Error('Use backend credential storage in Tauri environment');
    }

    const stored = this.getAll();
    delete stored[connectionId];

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stored));
  }

  /**
   * Clear all stored credentials
   */
  static clear(): void {
    if (isTauriEnvironment()) {
      throw new Error('Use backend credential storage in Tauri environment');
    }

    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem(this.KEY_STORAGE_KEY);
    this.cryptoKeyPromise = null;
  }

  /**
   * Get all stored credentials
   * @returns All stored credentials
   */
  private static getAll(): Record<string, any> {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  }

  private static getCrypto(): Crypto {
    const cryptoObj = globalThis.crypto;
    if (!cryptoObj || !cryptoObj.subtle) {
      throw new Error('Web Crypto API is required for credential storage');
    }
    return cryptoObj;
  }

  private static async getOrCreateKey(): Promise<CryptoKey> {
    if (!this.cryptoKeyPromise) {
      this.cryptoKeyPromise = (async () => {
        const cryptoObj = this.getCrypto();
        const existing = localStorage.getItem(this.KEY_STORAGE_KEY);
        if (existing) {
          const raw = this.base64ToArrayBuffer(existing);
          return cryptoObj.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']);
        }
        const key = await cryptoObj.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
          'encrypt',
          'decrypt',
        ]);
        const exported = await cryptoObj.subtle.exportKey('raw', key);
        localStorage.setItem(this.KEY_STORAGE_KEY, this.arrayBufferToBase64(exported));
        return key;
      })().catch((error) => {
        this.cryptoKeyPromise = null;
        throw error;
      });
    }
    return this.cryptoKeyPromise;
  }

  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private static base64ToArrayBuffer(value: string): ArrayBuffer {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Encrypt a value using AES-GCM with a per-installation key.
   */
  private static async encrypt(value: string): Promise<string> {
    const cryptoObj = this.getCrypto();
    const key = await this.getOrCreateKey();
    const iv = cryptoObj.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(value);
    const ciphertext = await cryptoObj.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    const payload = new Uint8Array(iv.length + ciphertext.byteLength);
    payload.set(iv, 0);
    payload.set(new Uint8Array(ciphertext), iv.length);
    return this.arrayBufferToBase64(payload.buffer);
  }

  /**
   * Decrypt a value produced by `encrypt`.
   */
  private static async decrypt(value: string): Promise<string> {
    const cryptoObj = this.getCrypto();
    const key = await this.getOrCreateKey();
    const data = this.base64ToArrayBuffer(value);
    const bytes = new Uint8Array(data);
    if (bytes.length < 13) {
      throw new Error('Encrypted payload too short');
    }

    const iv = bytes.slice(0, 12);
    const payload = bytes.slice(12);
    const plaintext = await cryptoObj.subtle.decrypt({ name: 'AES-GCM', iv }, key, payload);
    return new TextDecoder().decode(plaintext);
  }
}
