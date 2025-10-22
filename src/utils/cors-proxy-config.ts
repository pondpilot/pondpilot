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

import { getJSONCookie, deleteCookie } from './cookies';
import { LOCAL_STORAGE_KEYS } from '../models/local-storage';
import { getViteEnv } from '@utils/env';

const OFFICIAL_PROXY_URL = 'https://cors-proxy.pondpilot.io';
const DEV_PROXY_URL = 'http://localhost:3000';

/**
 * Prefix used for manual proxy mode
 * Usage: proxy:https://example.com/db.duckdb
 */
export const PROXY_PREFIX = 'proxy:';
export const PROXY_PREFIX_LENGTH = PROXY_PREFIX.length;

/**
 * CORS proxy behavior modes
 */
export const CORS_PROXY_BEHAVIORS = {
  /** Automatically use proxy on CORS errors */
  AUTO: 'auto',
  /** Manual mode - use proxy: prefix to force proxy for specific databases */
  MANUAL: 'manual',
} as const;

export type CorsProxyBehavior = (typeof CORS_PROXY_BEHAVIORS)[keyof typeof CORS_PROXY_BEHAVIORS];

export interface CorsProxySettings {
  behavior: CorsProxyBehavior;
}

const DEFAULT_SETTINGS: CorsProxySettings = {
  behavior: 'auto',
};

/**
 * Validate and normalize a behavior value
 */
function validateBehavior(value: unknown): CorsProxyBehavior {
  // Backward compatibility: 'never' was renamed to 'manual'
  if (value === 'never') {
    return 'manual';
  }

  // Check if it's a valid behavior
  const validBehaviors = Object.values(CORS_PROXY_BEHAVIORS);
  if (typeof value === 'string' && validBehaviors.includes(value as CorsProxyBehavior)) {
    return value as CorsProxyBehavior;
  }

  // Return default if invalid
  return DEFAULT_SETTINGS.behavior;
}

/**
 * Validate settings data from storage
 */
function validateSettings(data: unknown): CorsProxySettings {
  if (typeof data !== 'object' || !data) {
    return DEFAULT_SETTINGS;
  }

  const obj = data as Record<string, unknown>;
  const behavior = validateBehavior(obj.behavior);

  return { behavior };
}

/**
 * Get CORS proxy settings
 * Migrates from cookies to localStorage if needed
 */
export function getCorsProxySettings(): CorsProxySettings {
  try {
    // Try to load from localStorage first
    const localStorageData = localStorage.getItem(LOCAL_STORAGE_KEYS.CORS_PROXY_SETTINGS);
    if (localStorageData) {
      const parsed = JSON.parse(localStorageData);
      return validateSettings(parsed);
    }

    // Migration: check for old cookie-based settings
    const cookieData = getJSONCookie<Partial<CorsProxySettings>>(
      LOCAL_STORAGE_KEYS.CORS_PROXY_SETTINGS,
    );
    if (cookieData) {
      const settings = validateSettings(cookieData);
      // Migrate to localStorage
      saveCorsProxySettings(settings);
      // Remove old cookie
      deleteCookie(LOCAL_STORAGE_KEYS.CORS_PROXY_SETTINGS);
      return settings;
    }
  } catch (error) {
    console.warn('Failed to load CORS proxy settings:', error);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Save CORS proxy settings to localStorage
 */
export function saveCorsProxySettings(settings: CorsProxySettings): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEYS.CORS_PROXY_SETTINGS, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save CORS proxy settings:', error);
    throw new Error('Failed to save CORS proxy settings. Please try again.');
  }
}

/**
 * Get environment variables (extracted for testability)
 * @internal
 */
function getEnv(): { VITE_CORS_PROXY_URL: string | undefined; DEV: boolean } {
  return getViteEnv();
}

/**
 * Get the CORS proxy URL to use
 *
 * Priority:
 * 1. VITE_CORS_PROXY_URL environment variable (for self-hosters)
 * 2. Development: localhost:3000
 * 3. Production: official proxy (cors-proxy.pondpilot.io)
 */
function getProxyUrl(): string {
  const env = getEnv();

  // Check for environment variable override (for self-hosters)
  if (env.VITE_CORS_PROXY_URL) {
    return env.VITE_CORS_PROXY_URL;
  }

  // In development, try localhost first (if running local proxy)
  if (env.DEV) {
    return DEV_PROXY_URL;
  }

  // Production: use official proxy
  return OFFICIAL_PROXY_URL;
}

/**
 * Check for mixed content issues (http proxy with https app)
 */
function checkMixedContent(proxyUrl: string): void {
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    proxyUrl.startsWith('http:')
  ) {
    console.warn(
      `[CORS Proxy] Mixed content warning: Using HTTP proxy (${proxyUrl}) with HTTPS app. ` +
        `Requests may be blocked by the browser. Consider using an HTTPS proxy.`,
    );
  }
}

/**
 * Wrap a URL with the CORS proxy
 */
export function wrapWithCorsProxy(url: string): string {
  try {
    const proxyUrl = getProxyUrl();
    checkMixedContent(proxyUrl);
    return `${proxyUrl}/proxy?url=${encodeURIComponent(url)}`;
  } catch (error) {
    console.warn('Failed to wrap URL with CORS proxy, using direct URL:', error);
    return url;
  }
}

/**
 * Remote protocols that can be accessed over the network
 *
 * Note: s3:, gcs:, and azure: are considered "remote" from DuckDB's perspective,
 * but the CORS proxy only handles http: and https: protocols.
 * Cloud storage protocols (s3:, gcs:, azure:) are handled directly by DuckDB's
 * httpfs extension and its configuration/credential system.
 */
export const REMOTE_PROTOCOLS = ['http:', 'https:', 's3:', 'gcs:', 'azure:'] as const;

/**
 * Check if a URL is a remote URL that might need CORS proxy
 */
export function isRemoteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return REMOTE_PROTOCOLS.includes(parsed.protocol as any);
  } catch {
    return false;
  }
}

/**
 * Check if a URL points to cloud storage (S3, GCS, or Azure Blob Storage)
 * These are handled by DuckDB's httpfs extension, not the CORS proxy
 */
export function isCloudStorageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Direct cloud storage protocols
    if (parsed.protocol === 's3:' || parsed.protocol === 'gcs:' || parsed.protocol === 'azure:') {
      return true;
    }

    // HTTPS URLs with cloud storage hostnames
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      const hostname = parsed.hostname.toLowerCase();

      // S3 patterns:
      // - bucket.s3.region.amazonaws.com
      // - s3.region.amazonaws.com/bucket
      // - bucket.s3.amazonaws.com (legacy)
      // - s3.amazonaws.com
      if (
        (hostname.includes('.s3.') || hostname.includes('.s3-') || hostname.startsWith('s3.') || hostname.startsWith('s3-')) &&
        hostname.includes('amazonaws.com')
      ) {
        return true;
      }
      if (hostname === 's3.amazonaws.com') {
        return true;
      }

      // GCS patterns:
      // - storage.googleapis.com
      // - storage.cloud.google.com
      if (hostname === 'storage.googleapis.com' || hostname === 'storage.cloud.google.com') {
        return true;
      }

      // Azure Blob Storage patterns:
      // - accountname.blob.core.windows.net
      if (hostname.endsWith('.blob.core.windows.net')) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Determine if a URL should use the CORS proxy based on behavior settings
 *
 * This centralizes the decision logic for when to use the proxy, ensuring
 * consistent behavior across the application.
 *
 * Note: Users can access cloud storage via two methods:
 * - Native protocols (s3://, gcs://, azure://) → Always use DuckDB httpfs
 * - HTTPS URLs (https://bucket.s3.amazonaws.com/...) → Can use proxy if needed
 *
 * @param url - The URL to check
 * @param hadProxyPrefix - Whether the URL had an explicit proxy: prefix
 * @param behavior - The CORS proxy behavior setting
 * @param hadCorsError - Whether a CORS error occurred (for auto retry)
 * @returns true if the URL should be proxied
 */
export function shouldUseProxyFor(
  url: string,
  hadProxyPrefix: boolean,
  behavior: CorsProxyBehavior,
  hadCorsError: boolean = false,
): boolean {
  // Only proxy remote URLs
  if (!isRemoteUrl(url)) {
    return false;
  }

  // Native cloud storage protocols must use DuckDB httpfs extension
  // (they're not HTTP URLs, so proxy can't handle them)
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 's3:' || parsed.protocol === 'gcs:' || parsed.protocol === 'azure:') {
      return false;
    }
  } catch {
    return false;
  }

  // Manual mode: only use proxy if explicitly requested via prefix
  if (behavior === 'manual') {
    return hadProxyPrefix;
  }

  // Auto mode: use proxy only on CORS errors
  return hadCorsError;
}

/**
 * Normalize a remote URL by stripping proxy: prefix and detecting if it's remote
 *
 * This utility centralizes URL preprocessing for ATTACH statements, ensuring
 * consistent handling of:
 * - proxy: prefix stripping (used in manual mode)
 * - Remote protocol detection (http, https, s3, gcs, azure)
 *
 * @param rawUrl - The raw URL which may have a proxy: prefix
 * @returns Object containing:
 *   - url: Normalized URL with proxy: prefix removed
 *   - isRemote: Whether the URL uses a remote protocol
 *   - hadProxyPrefix: Whether the original URL had a proxy: prefix
 *
 * @example
 * normalizeRemoteUrl('proxy:https://example.com/db.duckdb')
 * // Returns: { url: 'https://example.com/db.duckdb', isRemote: true, hadProxyPrefix: true }
 *
 * normalizeRemoteUrl('s3://bucket/data.parquet')
 * // Returns: { url: 's3://bucket/data.parquet', isRemote: true, hadProxyPrefix: false }
 */
export function normalizeRemoteUrl(rawUrl: string): {
  url: string;
  isRemote: boolean;
  hadProxyPrefix: boolean;
} {
  let url = rawUrl;
  let hadProxyPrefix = false;

  // Strip proxy: prefix if present (from manual mode)
  if (url.startsWith(PROXY_PREFIX)) {
    url = url.substring(PROXY_PREFIX_LENGTH);
    hadProxyPrefix = true;
  }

  // Check if this is a remote URL
  const isRemote = isRemoteUrl(url);

  return { url, isRemote, hadProxyPrefix };
}

/**
 * Convert an S3 URL to an HTTPS URL
 *
 * Converts s3://bucket/path to an appropriate HTTPS URL.
 * Handles dotted bucket names and preserves query strings.
 *
 * For buckets with dots (e.g., my.bucket), uses path-style URLs to avoid
 * TLS certificate validation issues. For buckets without dots, uses
 * virtual-hosted-style URLs.
 *
 * @param s3Url - The S3 URL (s3://bucket/path?query)
 * @returns HTTPS URL, or null if invalid S3 URL
 *
 * @example
 * convertS3ToHttps('s3://pondpilot/chinook.duckdb')
 * // Returns: 'https://pondpilot.s3.amazonaws.com/chinook.duckdb'
 *
 * @example
 * convertS3ToHttps('s3://my.dotted.bucket/data.csv?versionId=abc123')
 * // Returns: 'https://s3.amazonaws.com/my.dotted.bucket/data.csv?versionId=abc123'
 */
export function convertS3ToHttps(s3Url: string): string | null {
  try {
    const parsed = new URL(s3Url);

    // Only handle s3:// protocol
    if (parsed.protocol !== 's3:') {
      return null;
    }

    // Extract components
    const bucket = parsed.hostname;
    const path = parsed.pathname; // includes leading /
    const search = parsed.search; // includes leading ? if present

    if (!bucket) {
      return null;
    }

    // Buckets with dots in the name cause TLS wildcard mismatch with
    // virtual-hosted-style URLs (https://my.bucket.s3.amazonaws.com)
    // Use path-style instead: https://s3.amazonaws.com/my.bucket/path
    if (bucket.includes('.')) {
      return `https://s3.amazonaws.com/${bucket}${path}${search}`;
    }

    // For buckets without dots, use virtual-hosted-style
    // This will auto-redirect to the correct region
    return `https://${bucket}.s3.amazonaws.com${path}${search}`;
  } catch {
    return null;
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
