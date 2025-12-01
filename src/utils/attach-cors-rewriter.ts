/**
 * CORS Proxy URL Rewriter for ATTACH Statements
 *
 * Minimal utility to rewrite HTTP(S) URLs in ATTACH statements to use CORS proxy.
 * Only rewrites URLs that don't already use the proxy.
 */

import {
  wrapWithCorsProxyPathBased,
  isRemoteUrl,
  PROXY_PREFIX,
  PROXY_PREFIX_LENGTH,
  convertS3ToHttps,
} from './cors-proxy-config';
import { SQLStatement, classifySQLStatement } from './editor/sql';

/**
 * Check if a query contains an ATTACH statement
 */
export function isAttachStatement(query: string): boolean {
  const classified = classifySQLStatement(query);
  return classified.type === SQLStatement.ATTACH;
}

export interface RewriteAttachUrlOptions {
  /**
   * If true, always wrap remote URLs regardless of behavior setting (used in auto-retry)
   */
  forceWrap?: boolean;
  /**
   * Custom S3 endpoint for non-AWS S3-compatible services (e.g., MinIO).
   * Example: 'minio.example.com:9000'
   */
  s3Endpoint?: string;
}

/**
 * Rewrite HTTP(S) and S3 URLs in an ATTACH statement to use CORS proxy
 *
 * Handles standard syntax and special proxy: prefix syntax
 *
 * Examples:
 *   ATTACH 'https://example.com/db.duckdb' AS mydb
 *   → (no change in auto mode, unless retry after CORS error)
 *
 *   ATTACH 'proxy:https://example.com/db.duckdb' AS mydb
 *   → ATTACH 'http://localhost:3000/proxy?url=https%3A%2F%2F...' AS mydb (force proxy)
 *
 *   ATTACH 's3://bucket/db.duckdb' AS mydb
 *   → (tries native s3:// first, converts to https:// + proxy on CORS error)
 *
 * @param query - The SQL query to rewrite
 * @param optionsOrForceWrap - Options object or boolean for backward compatibility
 */
export function rewriteAttachUrl(
  query: string,
  optionsOrForceWrap: boolean | RewriteAttachUrlOptions = false,
): { rewritten: string; wasRewritten: boolean } {
  // Support both old boolean signature and new options object
  const options: RewriteAttachUrlOptions =
    typeof optionsOrForceWrap === 'boolean'
      ? { forceWrap: optionsOrForceWrap }
      : optionsOrForceWrap;
  const { forceWrap = false, s3Endpoint } = options;
  if (!isAttachStatement(query)) {
    return { rewritten: query, wasRewritten: false };
  }

  let wasRewritten = false;

  // Match ATTACH 'url' pattern (handles both single and double quotes)
  // Matches http://, https://, s3://, gcs://, and azure:// URLs with optional proxy: prefix
  const rewritten = query.replace(
    /ATTACH\s+(['"])((?:proxy:)?(?:https?|s3|gcs|azure):\/\/[^'"]+)\1/gi,
    (match, quote, url) => {
      // Check if it's an explicit proxy: request
      const isExplicitProxy = url.startsWith(PROXY_PREFIX);
      const cleanUrl = isExplicitProxy ? url.substring(PROXY_PREFIX_LENGTH) : url;

      // Check if URL is already proxied (don't double-wrap)
      if (cleanUrl.includes('/proxy?url=')) {
        wasRewritten = true;
        return `ATTACH ${quote}${cleanUrl}${quote}`;
      }

      // Handle S3 URLs - convert to HTTPS before wrapping
      // This handles both forceWrap (auto-retry) and explicit proxy: prefix scenarios
      if (cleanUrl.startsWith('s3://') && (isExplicitProxy || forceWrap)) {
        const httpsUrl = convertS3ToHttps(cleanUrl, s3Endpoint);
        if (httpsUrl) {
          // Use path-based proxy for .duckdb files to allow DuckDB to construct URLs for related files
          const proxiedUrl = wrapWithCorsProxyPathBased(httpsUrl);
          wasRewritten = true;
          return `ATTACH ${quote}${proxiedUrl}${quote}`;
        }
        // If conversion failed, fall through to return original URL
        // (this will attempt native s3:// access via DuckDB's httpfs extension)
      }

      // Only wrap if it's a remote HTTP(S) URL AND one of these conditions:
      // 1. Explicit proxy: prefix
      // 2. forceWrap is true (auto-retry after CORS error)
      // Note: S3/GCS/Azure native protocols are handled above or use DuckDB's httpfs
      if (isRemoteUrl(cleanUrl)) {
        // Don't wrap native cloud storage protocols - they can't be proxied
        try {
          const parsed = new URL(cleanUrl);
          if (
            parsed.protocol === 's3:' ||
            parsed.protocol === 'gcs:' ||
            parsed.protocol === 'azure:'
          ) {
            // Return original URL - will use DuckDB's httpfs extension
            return `ATTACH ${quote}${cleanUrl}${quote}`;
          }
        } catch {
          // Invalid URL, fall through to return original
        }

        if (isExplicitProxy || forceWrap) {
          // Use path-based proxy for database files to allow DuckDB to construct URLs for related files
          const proxiedUrl = wrapWithCorsProxyPathBased(cleanUrl);
          wasRewritten = true;
          return `ATTACH ${quote}${proxiedUrl}${quote}`;
        }
      }

      // If we stripped proxy: prefix but didn't wrap, still mark as rewritten
      if (isExplicitProxy) {
        wasRewritten = true;
      }

      // Return cleaned URL (with proxy: stripped if it was there)
      return `ATTACH ${quote}${cleanUrl}${quote}`;
    },
  );

  return { rewritten, wasRewritten };
}

/**
 * Create a DuckDB macro for explicit proxy usage
 *
 * Usage:
 *   SELECT attach_with_proxy('https://example.com/db.duckdb', 'mydb');
 */
export function getCorsProxyMacros(): string[] {
  return [
    // Macro to attach with CORS proxy
    `CREATE OR REPLACE MACRO attach_with_proxy(url, db_name) AS
      'ATTACH ${PROXY_PREFIX}' || url || ' AS ' || db_name`,
  ];
}
