/**
 * Query Execution with CORS Retry
 *
 * Wraps pool.query() and pooled connection.query() to automatically retry
 * ATTACH statements with CORS proxy on failure.
 */

import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { AsyncDuckDBPooledConnection } from '@features/duckdb-context/duckdb-pooled-connection';
import { showAlert } from '@components/app-notifications';
import * as arrow from 'apache-arrow';
import { rewriteAttachUrl, isAttachStatement } from './attach-cors-rewriter';
import { getCorsProxySettings, PROXY_PREFIX } from './cors-proxy-config';
import { isCorsError } from './error-classification';

/**
 * Execute a query with automatic CORS proxy retry for ATTACH statements
 *
 * Behavior:
 * 1. Try query directly first
 * 2. If CORS error and is ATTACH statement → rewrite URLs and retry
 * 3. Show notification when proxy is used
 *
 * @param pool The DuckDB connection pool
 * @param query The SQL query to execute
 * @returns Query result
 */
export async function queryWithCorsRetry<
  T extends {
    [key: string]: arrow.DataType;
  } = any,
>(pool: AsyncDuckDBConnectionPool, query: string): Promise<arrow.Table<T>> {
  const settings = getCorsProxySettings();

  // First, check for explicit proxy: prefix in ATTACH statements
  // This must be done BEFORE sending to DuckDB to avoid it being parsed as an extension
  if (isAttachStatement(query) && query.includes(PROXY_PREFIX)) {
    const { rewritten } = rewriteAttachUrl(query);
    // Always use the rewritten query to ensure proxy: prefix is stripped
    // even if the URL wasn't actually wrapped with the proxy
    return await pool.query<T>(rewritten);
  }

  try {
    // Try direct execution first (for 'auto' mode)
    return await pool.query<T>(query);
  } catch (error) {
    // Only retry if it's a CORS error and an ATTACH statement (auto mode)
    if (settings.behavior === 'auto' && isCorsError(error) && isAttachStatement(query)) {
      // Check if this is an S3 URL for better messaging
      const isS3Url = query.toLowerCase().includes('s3://');

      // Rewrite the query to use CORS proxy (forceWrap = true)
      const { rewritten, wasRewritten } = rewriteAttachUrl(query, true);

      if (wasRewritten) {
        // Show notification to user with context-specific message
        if (isS3Url) {
          showAlert({
            title: 'Using CORS proxy for S3',
            message:
              'S3 URL converted to HTTPS and accessed via CORS proxy. For better performance, configure CORS on your S3 bucket.',
            autoClose: 5000,
          });
        } else {
          showAlert({
            title: 'Using CORS proxy',
            message: 'Remote database accessed via CORS proxy for compatibility',
            autoClose: 3000,
          });
        }

        // Retry with proxied URL
        return await pool.query<T>(rewritten);
      }
    }

    // If not a CORS error, or rewrite didn't help, re-throw original error
    throw error;
  }
}

/**
 * Execute a query with abort signal and automatic CORS proxy retry
 *
 * Similar to queryWithCorsRetry but supports abort signal
 */
export async function queryAbortableWithCorsRetry<
  T extends {
    [key: string]: arrow.DataType;
  } = any,
>(
  pool: AsyncDuckDBConnectionPool,
  query: string,
  signal: AbortSignal,
): Promise<{ value: arrow.Table<T>; aborted: false } | { value: void; aborted: true }> {
  const settings = getCorsProxySettings();

  // First, check for explicit proxy: prefix in ATTACH statements
  // This must be done BEFORE sending to DuckDB to avoid it being parsed as an extension
  if (isAttachStatement(query) && query.includes(PROXY_PREFIX)) {
    const { rewritten } = rewriteAttachUrl(query);
    // Always use the rewritten query to ensure proxy: prefix is stripped
    // even if the URL wasn't actually wrapped with the proxy
    return await pool.queryAbortable<T>(rewritten, signal);
  }

  try {
    // Try direct execution first (for 'auto' mode)
    return await pool.queryAbortable<T>(query, signal);
  } catch (error) {
    // Only retry if it's a CORS error and an ATTACH statement (auto mode)
    if (settings.behavior === 'auto' && isCorsError(error) && isAttachStatement(query)) {
      // Check if this is an S3 URL for better messaging
      const isS3Url = query.toLowerCase().includes('s3://');

      // Rewrite the query to use CORS proxy (forceWrap = true)
      const { rewritten, wasRewritten } = rewriteAttachUrl(query, true);

      if (wasRewritten) {
        // Show notification to user with context-specific message
        if (isS3Url) {
          showAlert({
            title: 'Using CORS proxy for S3',
            message:
              'S3 URL converted to HTTPS and accessed via CORS proxy. For better performance, configure CORS on your S3 bucket.',
            autoClose: 5000,
          });
        } else {
          showAlert({
            title: 'Using CORS proxy',
            message: 'Remote database accessed via CORS proxy for compatibility',
            autoClose: 3000,
          });
        }

        // Retry with proxied URL
        return await pool.queryAbortable<T>(rewritten, signal);
      }
    }

    // If not a CORS error, or rewrite didn't help, re-throw original error
    throw error;
  }
}

/**
 * Execute a query on a pooled connection with automatic CORS proxy retry
 *
 * For use with AsyncDuckDBPooledConnection (from pool.getPooledConnection())
 *
 * @param conn The pooled connection
 * @param query The SQL query to execute
 * @returns Query result
 */
export async function pooledConnectionQueryWithCorsRetry<
  T extends {
    [key: string]: arrow.DataType;
  } = any,
>(conn: AsyncDuckDBPooledConnection, query: string): Promise<arrow.Table<T>> {
  const settings = getCorsProxySettings();

  // First, check for explicit proxy: prefix in ATTACH statements
  // This must be done BEFORE sending to DuckDB to avoid it being parsed as an extension
  if (isAttachStatement(query) && query.includes(PROXY_PREFIX)) {
    const { rewritten } = rewriteAttachUrl(query);
    // Always use the rewritten query to ensure proxy: prefix is stripped
    // even if the URL wasn't actually wrapped with the proxy
    return await conn.query<T>(rewritten);
  }

  try {
    // Try direct execution first (for 'auto' mode)
    return await conn.query<T>(query);
  } catch (error) {
    // Only retry if it's a CORS error and an ATTACH statement (auto mode)
    if (settings.behavior === 'auto' && isCorsError(error) && isAttachStatement(query)) {
      // Check if this is an S3 URL for better messaging
      const isS3Url = query.toLowerCase().includes('s3://');

      // Rewrite the query to use CORS proxy (forceWrap = true)
      const { rewritten, wasRewritten } = rewriteAttachUrl(query, true);

      if (wasRewritten) {
        // Show notification to user with context-specific message
        if (isS3Url) {
          showAlert({
            title: 'Using CORS proxy for S3',
            message:
              'S3 URL converted to HTTPS and accessed via CORS proxy. For better performance, configure CORS on your S3 bucket.',
            autoClose: 5000,
          });
        } else {
          showAlert({
            title: 'Using CORS proxy',
            message: 'Remote database accessed via CORS proxy for compatibility',
            autoClose: 3000,
          });
        }

        // Retry with proxied URL
        return await conn.query<T>(rewritten);
      }
    }

    // If not a CORS error, or rewrite didn't help, re-throw original error
    throw error;
  }
}
