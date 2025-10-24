/**
 * CORS Proxy URL Rewriter for ATTACH Statements
 *
 * Minimal utility to rewrite HTTP(S) URLs in ATTACH statements to use CORS proxy.
 * Only rewrites URLs that don't already use the proxy.
 */

import {
  wrapWithCorsProxy,
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
 * @param forceWrap - If true, always wrap remote URLs regardless of behavior setting (used in auto-retry)
 */
export function rewriteAttachUrl(
  query: string,
  forceWrap: boolean = false,
): { rewritten: string; wasRewritten: boolean } {
  if (!isAttachStatement(query)) {
    return { rewritten: query, wasRewritten: false };
  }

  let wasRewritten = false;

  // Match ATTACH 'url' pattern (handles both single and double quotes)
  // Updated regex to also match s3:// URLs
  const rewritten = query.replace(
    /ATTACH\s+(['"])((?:proxy:)?(?:https?|s3):\/\/[^'"]+)\1/gi,
    (match, quote, url) => {
      // Check if it's an explicit proxy: request
      const isExplicitProxy = url.startsWith(PROXY_PREFIX);
      const cleanUrl = isExplicitProxy ? url.substring(PROXY_PREFIX_LENGTH) : url;

      // Check if URL is already proxied (don't double-wrap)
      if (cleanUrl.includes('/proxy?url=')) {
        wasRewritten = true;
        return `ATTACH ${quote}${cleanUrl}${quote}`;
      }

      // Handle S3 URLs when forceWrap is true (CORS retry scenario)
      if (forceWrap && cleanUrl.startsWith('s3://')) {
        const httpsUrl = convertS3ToHttps(cleanUrl);
        if (httpsUrl) {
          const proxiedUrl = wrapWithCorsProxy(httpsUrl);
          wasRewritten = true;
          return `ATTACH ${quote}${proxiedUrl}${quote}`;
        }
        // If conversion failed, fall through to return original URL
      }

      // Only wrap if it's a remote URL AND one of these conditions:
      // 1. Explicit proxy: prefix
      // 2. forceWrap is true (auto-retry after CORS error)
      if (isRemoteUrl(cleanUrl)) {
        if (isExplicitProxy || forceWrap) {
          const proxiedUrl = wrapWithCorsProxy(cleanUrl);
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
