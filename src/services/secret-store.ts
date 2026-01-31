/**
 * Encrypted Secret Store
 *
 * Persists secrets (credentials, API keys) encrypted with AES-GCM using a
 * non-extractable CryptoKey stored in a dedicated IndexedDB database,
 * separate from the main app-data DB.
 *
 * Each secret value is encrypted with a unique random 12-byte IV.
 * Labels are stored unencrypted for listing without decryption.
 * If the key is lost (browser partial clear), decryption fails gracefully.
 *
 * Security considerations:
 * - This does NOT protect against XSS or malicious JS on the same origin.
 *   The non-extractable key prevents raw key exfiltration, but JS can still
 *   call encrypt/decrypt through the Web Crypto API.
 * - If the browser clears the key database (pondpilot-secret-key) while
 *   retaining app-data, all encrypted secrets become unrecoverable.
 * - There is currently no key rotation mechanism. Adding rotation would
 *   require re-encrypting all secrets with a new key on access.
 */

import { NewId } from '@models/new-id';
import { AppIdbSchema, SECRET_TABLE_NAME } from '@models/persisted-store';
import { makeIdFactory } from '@utils/new-id';
import { IDBPDatabase } from 'idb';

// ── Types ───────────────────────────────────────────────────────────────

export type SecretId = NewId<'SecretId'>;
export const makeSecretId = makeIdFactory<SecretId>();

export interface SecretPayload {
  /** Unencrypted display label (for listing without decryption) */
  label: string;
  /** The actual credential data (encrypted at rest) */
  data: Record<string, string>;
}

export interface PersistedSecret {
  id: SecretId;
  label: string;
  encrypted: { ciphertext: string; iv: string };
  createdAt: number;
  updatedAt: number;
}

// ── Key DB ──────────────────────────────────────────────────────────────

const KEY_DB_NAME = 'pondpilot-secret-key';
const KEY_DB_VERSION = 1;
const KEY_STORE_NAME = 'keys';
const KEY_RECORD_ID = 'master';

let cachedKey: CryptoKey | null = null;

/**
 * Opens the dedicated key database and returns (or creates) the master
 * AES-GCM encryption key.  The key is `extractable: false` so it can
 * never be read by JavaScript — only used via the Web Crypto API.
 */
export async function getOrCreateCryptoKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error(
      'Web Crypto API is not available. Secret storage requires a secure context (HTTPS or localhost).',
    );
  }

  // Open the dedicated key DB (separate from app-data)
  const keyDb = await openKeyDb();

  try {
    const existing = await keyDb.get(KEY_STORE_NAME, KEY_RECORD_ID);
    if (existing) {
      cachedKey = existing as CryptoKey;
      return cachedKey;
    }

    // Generate a new key
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable
      ['encrypt', 'decrypt'],
    );

    await keyDb.put(KEY_STORE_NAME, key, KEY_RECORD_ID);
    cachedKey = key;
    return key;
  } finally {
    keyDb.close();
  }
}

async function openKeyDb(): Promise<IDBPDatabase> {
  const { openDB } = await import('idb');
  return openDB(KEY_DB_NAME, KEY_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
        db.createObjectStore(KEY_STORE_NAME);
      }
    },
  });
}

// ── Crypto helpers ──────────────────────────────────────────────────────

export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
}

export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function encrypt(
  key: CryptoKey,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv.buffer),
  };
}

export async function decrypt(
  key: CryptoKey,
  data: { ciphertext: string; iv: string },
): Promise<string> {
  const ciphertextBuffer = base64ToBuffer(data.ciphertext);
  const iv = base64ToBuffer(data.iv);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    ciphertextBuffer,
  );
  return new TextDecoder().decode(decrypted);
}

// ── CRUD ────────────────────────────────────────────────────────────────

/**
 * Store or update a secret.  The `data` object is serialized to JSON
 * and encrypted; the label is stored in the clear.
 */
export async function putSecret(
  iDb: IDBPDatabase<AppIdbSchema>,
  id: SecretId,
  payload: SecretPayload,
): Promise<void> {
  const key = await getOrCreateCryptoKey();
  const plaintext = JSON.stringify(payload.data);
  const encrypted = await encrypt(key, plaintext);

  const now = Date.now();
  const existing = await iDb.get(SECRET_TABLE_NAME, id);

  const record: PersistedSecret = {
    id,
    label: payload.label,
    encrypted,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await iDb.put(SECRET_TABLE_NAME, record, id);
}

/**
 * Retrieve and decrypt a secret.  Returns null if the secret doesn't
 * exist or decryption fails (e.g. key was lost).
 */
export async function getSecret(
  iDb: IDBPDatabase<AppIdbSchema>,
  id: SecretId,
): Promise<SecretPayload | null> {
  const record = await iDb.get(SECRET_TABLE_NAME, id);
  if (!record) return null;

  try {
    const key = await getOrCreateCryptoKey();
    const plaintext = await decrypt(key, record.encrypted);
    const data = JSON.parse(plaintext) as Record<string, string>;
    return { label: record.label, data };
  } catch (error) {
    console.warn('Failed to decrypt secret — key may have been lost:', error);
    return null;
  }
}

/**
 * Delete a secret by ID.
 */
export async function deleteSecret(iDb: IDBPDatabase<AppIdbSchema>, id: SecretId): Promise<void> {
  await iDb.delete(SECRET_TABLE_NAME, id);
}

/**
 * List all secrets (label + id only — no decryption needed).
 */
export async function listSecrets(
  iDb: IDBPDatabase<AppIdbSchema>,
): Promise<Array<{ id: SecretId; label: string }>> {
  const all = await iDb.getAll(SECRET_TABLE_NAME);
  return all.map((record) => ({
    id: record.id,
    label: record.label,
  }));
}

/**
 * Clears the cached crypto key.  Primarily useful for testing.
 */
export function clearCachedKey(): void {
  cachedKey = null;
}
