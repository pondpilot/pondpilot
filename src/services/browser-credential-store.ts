import { isTauriEnvironment } from '@utils/browser';

/**
 * Browser-based credential storage for WASM environment
 * Stores database credentials in localStorage with basic encryption
 */
export class BrowserCredentialStore {
  private static STORAGE_KEY = 'pondpilot_credentials';

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
      password: await this.encrypt(credentials.password),
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
      password: await this.decrypt(creds.password),
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
  }

  /**
   * Get all stored credentials
   * @returns All stored credentials
   */
  private static getAll(): Record<string, any> {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  }

  /**
   * Encrypt a value using basic base64 encoding
   * TODO: Implement proper encryption using SubtleCrypto API
   * @param value - The value to encrypt
   * @returns The encrypted value
   */
  private static async encrypt(value: string): Promise<string> {
    // For now, use base64 encoding as a placeholder
    // In production, use SubtleCrypto API for proper encryption
    return btoa(value);
  }

  /**
   * Decrypt a value
   * TODO: Implement proper decryption using SubtleCrypto API
   * @param value - The value to decrypt
   * @returns The decrypted value
   */
  private static async decrypt(value: string): Promise<string> {
    // For now, use base64 decoding as a placeholder
    // In production, use SubtleCrypto API for proper decryption
    return atob(value);
  }
}
