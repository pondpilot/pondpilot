import { getJSONCookie, setJSONCookie, deleteCookie } from './cookies';
import { PersistentDataSourceId } from '../models/data-source';
import { LOCAL_STORAGE_KEYS } from '../models/local-storage';

export interface HTTPServerCredentials {
  username?: string;
  password?: string;
  token?: string;
}

/**
 * Sanitize credentials to prevent XSS attacks
 */
function sanitizeCredentials(credentials: HTTPServerCredentials): HTTPServerCredentials {
  const sanitized: HTTPServerCredentials = {};

  if (typeof credentials.username === 'string') {
    sanitized.username = credentials.username.trim().replace(/[<>]/g, '');
  }

  if (typeof credentials.password === 'string') {
    sanitized.password = credentials.password.trim().replace(/[<>]/g, '');
  }

  if (typeof credentials.token === 'string') {
    sanitized.token = credentials.token.trim().replace(/[<>]/g, '');
  }

  return sanitized;
}

/**
 * Get all stored HTTP server credentials
 */
function getAllCredentials(): Record<PersistentDataSourceId, HTTPServerCredentials> {
  try {
    return (
      getJSONCookie<Record<PersistentDataSourceId, HTTPServerCredentials>>(
        LOCAL_STORAGE_KEYS.HTTPSERVER_CREDENTIALS,
      ) || {}
    );
  } catch (error) {
    console.warn('Failed to load HTTP server credentials:', error);
    return {};
  }
}

/**
 * Save all HTTP server credentials
 */
function saveAllCredentials(
  credentials: Record<PersistentDataSourceId, HTTPServerCredentials>,
): void {
  try {
    setJSONCookie(LOCAL_STORAGE_KEYS.HTTPSERVER_CREDENTIALS, credentials, {
      secure: window.location.protocol === 'https:',
      sameSite: 'strict',
      maxAge: 777 * 24 * 60 * 60, // 777 days (same as AI config)
    });
  } catch (error) {
    console.error('Failed to save HTTP server credentials to cookies:', error);
    throw new Error('Failed to save HTTP server credentials. Please try again.');
  }
}

/**
 * Save credentials for a specific HTTP server
 */
export function saveHTTPServerCredentials(
  id: PersistentDataSourceId,
  credentials: HTTPServerCredentials,
): void {
  const sanitized = sanitizeCredentials(credentials);
  const allCredentials = getAllCredentials();

  allCredentials[id] = sanitized;
  saveAllCredentials(allCredentials);
}

/**
 * Get credentials for a specific HTTP server
 */
export function getCredentialsForServer(id: PersistentDataSourceId): HTTPServerCredentials | null {
  const allCredentials = getAllCredentials();
  return allCredentials[id] || null;
}

/**
 * Remove credentials for a specific HTTP server
 */
export function removeHTTPServerCredentials(id: PersistentDataSourceId): void {
  const allCredentials = getAllCredentials();

  if (allCredentials[id]) {
    delete allCredentials[id];

    // If no credentials left, delete the entire cookie
    if (Object.keys(allCredentials).length === 0) {
      deleteCookie(LOCAL_STORAGE_KEYS.HTTPSERVER_CREDENTIALS);
    } else {
      saveAllCredentials(allCredentials);
    }
  }
}
