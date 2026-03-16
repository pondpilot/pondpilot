import { LOCAL_STORAGE_KEYS } from '../models/local-storage';

/**
 * Retrieve the stored Google OAuth Client ID.
 * Returns an empty string if not configured.
 */
export function getGoogleOAuthClientId(): string {
  try {
    const value = localStorage.getItem(LOCAL_STORAGE_KEYS.GOOGLE_OAUTH_CLIENT_ID);
    return value?.trim() ?? '';
  } catch {
    return '';
  }
}

/**
 * Persist a Google OAuth Client ID to localStorage.
 * Pass an empty string to clear the stored value.
 */
export function saveGoogleOAuthClientId(clientId: string): void {
  const trimmed = clientId.trim();
  if (trimmed) {
    localStorage.setItem(LOCAL_STORAGE_KEYS.GOOGLE_OAUTH_CLIENT_ID, trimmed);
  } else {
    localStorage.removeItem(LOCAL_STORAGE_KEYS.GOOGLE_OAUTH_CLIENT_ID);
  }
}
