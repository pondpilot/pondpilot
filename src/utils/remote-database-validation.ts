/**
 * Remote Database URL Validation
 *
 * Pure validation functions for remote database URLs with no external dependencies
 */

/**
 * Allowed protocols for remote databases
 */
import { isTauriEnvironment } from '@utils/browser';

// Compute allowed protocols; 'md:' only in Tauri (desktop)
export const ALLOWED_REMOTE_PROTOCOLS = ((): readonly string[] => {
  const base = ['https:', 's3:', 'gcs:', 'azure:'] as const;
  return isTauriEnvironment() ? [...base, 'md:'] : base;
})();

/**
 * Validates a remote database URL for security and format
 */
export function validateRemoteDatabaseUrl(url: string): { isValid: boolean; error?: string } {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return { isValid: false, error: 'URL must be a non-empty string' };
  }

  // Check for potentially dangerous patterns
  if (url.includes('..') || url.includes('\\')) {
    return { isValid: false, error: 'URL contains invalid path characters' };
  }

  // Prevent local file access
  if (url.startsWith('file://') || url.startsWith('/') || url.match(/^[a-zA-Z]:\\/)) {
    return { isValid: false, error: 'Local file paths are not allowed for remote databases' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    return { isValid: false, error: 'Invalid URL format' };
  }

  // Check protocol
  if (!ALLOWED_REMOTE_PROTOCOLS.includes(parsedUrl.protocol as any)) {
    return {
      isValid: false,
      error: `Protocol "${parsedUrl.protocol}" is not allowed. Allowed protocols: ${ALLOWED_REMOTE_PROTOCOLS.join(', ')}`,
    };
  }

  // Additional validation for specific protocols
  if (parsedUrl.protocol === 'https:') {
    // Ensure hostname is present
    if (!parsedUrl.hostname) {
      return { isValid: false, error: 'HTTPS URLs must have a valid hostname' };
    }

    // Prevent localhost/loopback access for security
    if (
      parsedUrl.hostname === 'localhost' ||
      parsedUrl.hostname === '127.0.0.1' ||
      parsedUrl.hostname === '::1' ||
      parsedUrl.hostname.startsWith('192.168.') ||
      parsedUrl.hostname.startsWith('10.') ||
      parsedUrl.hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
    ) {
      return { isValid: false, error: 'Private/local network addresses are not allowed' };
    }
  }

  // Cloud storage validation
  if (parsedUrl.protocol === 's3:' && !parsedUrl.pathname.includes('/')) {
    return { isValid: false, error: 'S3 URLs must include a bucket and path' };
  }

  if (parsedUrl.protocol === 'gcs:' && !parsedUrl.pathname.includes('/')) {
    return { isValid: false, error: 'GCS URLs must include a bucket and path' };
  }

  if (parsedUrl.protocol === 'azure:' && !parsedUrl.pathname.includes('/')) {
    return { isValid: false, error: 'Azure URLs must include a container and path' };
  }

  // MotherDuck URLs (md:) are opaque and validated by DuckDB extension itself
  // Allow any md: URL format here

  return { isValid: true };
}

/**
 * Sanitizes a remote database URL by normalizing it and removing credentials
 */
export function sanitizeRemoteDatabaseUrl(url: string): string {
  const validation = validateRemoteDatabaseUrl(url);
  if (!validation.isValid) {
    throw new Error(`Invalid remote database URL: ${validation.error}`);
  }

  // Normalize the URL
  const parsedUrl = new URL(url);

  // Remove any fragment or excessive query parameters that might be risky
  parsedUrl.hash = '';

  // Strip credentials for security (they'll be handled separately by DuckDB)
  parsedUrl.username = '';
  parsedUrl.password = '';

  // For HTTPS URLs, normalize the path
  if (parsedUrl.protocol === 'https:') {
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/+/g, '/');
  }

  return parsedUrl.toString();
}

/**
 * Checks if a database path is a remote URL
 */
export function isRemoteDatabasePath(path: string): boolean {
  const validation = validateRemoteDatabaseUrl(path);
  return validation.isValid;
}

/**
 * Gets a display name for a remote database URL
 */
export function getRemoteDatabaseDisplayName(url: string): string {
  // Validate the URL first
  const validation = validateRemoteDatabaseUrl(url);
  if (!validation.isValid) {
    return url.length > 50 ? `${url.substring(0, 47)}...` : url;
  }

  try {
    const parsedUrl = new URL(url);

    switch (parsedUrl.protocol) {
      case 'md:':
        return 'MotherDuck';
      case 's3:': {
        const s3Parts = parsedUrl.pathname.substring(1).split('/');
        return `S3: ${s3Parts[0]}`;
      }

      case 'https:':
        return parsedUrl.hostname;

      case 'gcs:': {
        const gcsPath = parsedUrl.pathname.startsWith('/')
          ? parsedUrl.pathname.substring(1)
          : parsedUrl.pathname;
        const gcsParts = gcsPath.split('/');
        return `GCS: ${gcsParts[0]}`;
      }

      case 'azure:': {
        const azurePath = parsedUrl.pathname.startsWith('/')
          ? parsedUrl.pathname.substring(1)
          : parsedUrl.pathname;
        const azureParts = azurePath.split('/');
        return `Azure: ${azureParts[0]}`;
      }

      default:
        return parsedUrl.hostname || parsedUrl.href;
    }
  } catch {
    // If URL parsing fails, return a truncated version
    return url.length > 50 ? `${url.substring(0, 47)}...` : url;
  }
}
