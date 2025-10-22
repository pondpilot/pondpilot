/**
 * CORS Proxy Configuration
 *
 * Automatically wraps remote URLs with a CORS proxy to enable browser access
 * to resources that don't have CORS headers configured.
 *
 * Configuration priority:
 * 1. VITE_CORS_PROXY_URL environment variable (for self-hosters)
 * 2. localhost:3000 in development (if available)
 * 3. cors-proxy.pondpilot.io in production (default)
 */

const OFFICIAL_PROXY_URL = 'https://cors-proxy.pondpilot.io';
const DEV_PROXY_URL = 'http://localhost:3000';

let cachedProxyUrl: string | null = null;
let proxyHealthChecked = false;

/**
 * Get the CORS proxy URL to use
 */
function getProxyUrl(): string {
  // Check for environment variable override (for self-hosters)
  if (import.meta.env.VITE_CORS_PROXY_URL) {
    return import.meta.env.VITE_CORS_PROXY_URL as string;
  }

  // In development, try localhost first (if running local proxy)
  if (import.meta.env.DEV) {
    return DEV_PROXY_URL;
  }

  // Production: use official proxy
  return OFFICIAL_PROXY_URL;
}

/**
 * Wrap a URL with the CORS proxy
 */
export function wrapWithCorsProxy(url: string): string {
  try {
    const proxyUrl = getProxyUrl();
    return `${proxyUrl}/proxy?url=${encodeURIComponent(url)}`;
  } catch (error) {
    console.warn('Failed to wrap URL with CORS proxy, using direct URL:', error);
    return url;
  }
}

/**
 * Check if a URL is a remote URL that might need CORS proxy
 */
export function isRemoteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Test if the CORS proxy is reachable
 */
export async function testCorsProxy(): Promise<boolean> {
  try {
    const proxyUrl = getProxyUrl();
    const response = await fetch(`${proxyUrl}/health`, {
      method: 'GET',
      mode: 'cors',
    });

    if (!response.ok) return false;

    const data = await response.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}
