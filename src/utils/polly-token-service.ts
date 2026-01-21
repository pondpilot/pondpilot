/**
 * Service for managing Polly AI demo tokens.
 * Handles token acquisition, caching, and auto-refresh for the demo AI proxy.
 */

import { getPollyProxyUrl } from '../models/ai-service';

interface DemoTokenResponse {
  token: string;
  expires_at: string;
  user_id: string;
  user_type: string;
  limits: {
    requests_per_hour: number;
  };
}

interface CachedToken {
  token: string;
  expiresAt: Date;
  userId: string;
  limits: {
    requestsPerHour: number;
  };
}

// In-memory token cache (sessionStorage is used as backup)
let cachedToken: CachedToken | null = null;

// Pending token fetch promise to prevent duplicate concurrent requests
let pendingTokenFetch: Promise<CachedToken> | null = null;

const SESSION_STORAGE_KEY = 'polly_demo_token';

// Buffer time before expiry to refresh token (5 minutes)
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * Generate a simple browser fingerprint for rate limiting purposes.
 * This is not for security, just to help the server identify repeat visitors.
 */
function generateFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    window.screen.width,
    window.screen.height,
    window.screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 'unknown',
  ];

  // Simple hash function
  const str = components.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash &= hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Load token from session storage if available
 */
function loadTokenFromStorage(): CachedToken | null {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...parsed,
        expiresAt: new Date(parsed.expiresAt),
      };
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

/**
 * Save token to session storage
 */
function saveTokenToStorage(token: CachedToken): void {
  try {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        ...token,
        expiresAt: token.expiresAt.toISOString(),
      }),
    );
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear token from storage
 */
function clearTokenFromStorage(): void {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if a token is still valid (not expired)
 */
function isTokenValid(token: CachedToken): boolean {
  const now = new Date();
  const expiryWithBuffer = new Date(token.expiresAt.getTime() - EXPIRY_BUFFER_MS);
  return now < expiryWithBuffer;
}

/**
 * Fetch a new demo token from the proxy
 */
async function fetchDemoToken(): Promise<CachedToken> {
  const baseUrl = getPollyProxyUrl();
  const fingerprint = generateFingerprint();

  const response = await fetch(`${baseUrl}/auth/demo-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fingerprint }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get demo token: ${response.status}`);
  }

  const data: DemoTokenResponse = await response.json();

  const token: CachedToken = {
    token: data.token,
    expiresAt: new Date(data.expires_at),
    userId: data.user_id,
    limits: {
      requestsPerHour: data.limits.requests_per_hour,
    },
  };

  // Cache in memory and storage
  cachedToken = token;
  saveTokenToStorage(token);

  return token;
}

/**
 * Get a valid demo token, fetching a new one if necessary.
 * This is the main entry point for the token service.
 * Uses a pending promise to prevent duplicate concurrent fetch requests.
 */
export async function getDemoToken(): Promise<string> {
  // Check memory cache first
  if (cachedToken && isTokenValid(cachedToken)) {
    return cachedToken.token;
  }

  // Check session storage
  const storedToken = loadTokenFromStorage();
  if (storedToken && isTokenValid(storedToken)) {
    cachedToken = storedToken;
    return storedToken.token;
  }

  // If a fetch is already in progress, wait for it
  if (pendingTokenFetch) {
    const token = await pendingTokenFetch;
    return token.token;
  }

  // Fetch new token with deduplication
  pendingTokenFetch = fetchDemoToken();
  try {
    const newToken = await pendingTokenFetch;
    return newToken.token;
  } finally {
    pendingTokenFetch = null;
  }
}

/**
 * Clear the cached token (useful when user switches providers)
 */
export function clearDemoToken(): void {
  cachedToken = null;
  clearTokenFromStorage();
}
