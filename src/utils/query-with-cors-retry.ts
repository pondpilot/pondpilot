/**
 * Query Execution with CORS Retry
 *
 * Wraps pool.query() and pooled connection.query() to automatically retry
 * ATTACH statements with CORS proxy on failure.
 */

import { showAlert } from '@components/app-notifications';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { AsyncDuckDBPooledConnection } from '@features/duckdb-context/duckdb-pooled-connection';
import * as arrow from 'apache-arrow';

import { rewriteAttachUrl, isAttachStatement } from './attach-cors-rewriter';
import { getCorsProxySettings, getS3EndpointFromSession, PROXY_PREFIX } from './cors-proxy-config';
import { getErrorMessage, isCorsError } from './error-classification';

/**
 * Internal: Generic CORS retry logic
 *
 * Encapsulates the common retry pattern for all query execution types.
 * This function handles:
 * - Explicit proxy: prefix detection and stripping
 * - CORS error detection and retry
 * - User notifications
 * - Proxy error handling
 * - Custom S3 endpoint from DuckDB session variable
 *
 * @param query - The SQL query to execute
 * @param executor - Function to execute the query directly
 * @param retryExecutor - Function to execute the rewritten query on retry
 * @param getS3Endpoint - Function to get the s3_endpoint variable from DuckDB session
 * @param rollback - Function to rollback the transaction (needed after CORS error aborts transaction)
 * @returns Query result
 * @internal
 */
async function executeWithCorsRetry<TResult>(
  query: string,
  executor: () => Promise<TResult>,
  retryExecutor: (rewrittenQuery: string) => Promise<TResult>,
  getS3Endpoint: () => Promise<string | null>,
  rollback: () => Promise<void>,
): Promise<TResult> {
  const settings = getCorsProxySettings();

  // First, check for explicit proxy: prefix in ATTACH statements
  // This must be done BEFORE sending to DuckDB to avoid it being parsed as an extension
  if (isAttachStatement(query) && query.includes(PROXY_PREFIX)) {
    // Query DuckDB for custom S3 endpoint if this is an S3 URL
    const isS3Url = query.toLowerCase().includes('s3://');
    const s3Endpoint = isS3Url ? await getS3Endpoint() : null;

    const { rewritten } = rewriteAttachUrl(query, {
      forceWrap: false,
      s3Endpoint: s3Endpoint || undefined,
    });
    // Always use the rewritten query to ensure proxy: prefix is stripped
    // even if the URL wasn't actually wrapped with the proxy
    return await retryExecutor(rewritten);
  }

  try {
    // Try direct execution first (for 'auto' mode)
    return await executor();
  } catch (error) {
    // Only retry if it's a CORS error and an ATTACH statement (auto mode)
    if (settings.behavior === 'auto' && isCorsError(error) && isAttachStatement(query)) {
      // A failed ATTACH due to CORS error leaves DuckDB's transaction in an aborted state.
      // DuckDB-WASM wraps ATTACH in an implicit transaction, and when the HTTP request
      // fails due to CORS, that transaction becomes "aborted" rather than cleanly rolled back.
      // We must explicitly rollback before executing any new queries (like querying the
      // s3_endpoint session variable below), otherwise those queries will fail with
      // "transaction is aborted" errors.
      try {
        await rollback();
      } catch {
        // Ignore rollback errors - transaction might not be active or already rolled back
      }

      // Check if this is an S3 URL for better messaging
      const isS3Url = query.toLowerCase().includes('s3://');

      // Query DuckDB for custom S3 endpoint if this is an S3 URL
      // This must happen AFTER rollback, otherwise the query will fail
      const s3Endpoint = isS3Url ? await getS3Endpoint() : null;

      // Rewrite the query to use CORS proxy (forceWrap = true)
      const { rewritten, wasRewritten } = rewriteAttachUrl(query, {
        forceWrap: true,
        s3Endpoint: s3Endpoint || undefined,
      });

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
        try {
          return await retryExecutor(rewritten);
        } catch (proxyError) {
          const proxyErrorMsg = getErrorMessage(proxyError);

          // Check if database is already attached - this is actually a success case
          // (database was attached via proxy in a previous attempt)
          if (
            proxyErrorMsg.includes('already attached') ||
            proxyErrorMsg.includes('Unique file handle conflict')
          ) {
            // eslint-disable-next-line no-console
            console.info('Database already attached via CORS proxy, continuing...');
            // Return an empty Arrow Table since ATTACH doesn't return data
            // This matches the expected return type for query operations
            return new arrow.Table([]) as TResult;
          }

          console.error('CORS proxy retry failed:', proxyError);
          throw new Error(
            `Failed to connect via CORS proxy. Original error: ${getErrorMessage(error)}. ` +
              `Proxy error: ${proxyErrorMsg}`,
          );
        }
      }
    }

    // If not a CORS error, or rewrite didn't help, re-throw original error
    throw error;
  }
}

/**
 * Execute a query with automatic CORS proxy retry for ATTACH statements
 *
 * Behavior:
 * 1. Try query directly first
 * 2. If CORS error and is ATTACH statement → rewrite URLs and retry
 * 3. Show notification when proxy is used
 * 4. Use s3_endpoint variable from DuckDB session if set
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
  return executeWithCorsRetry(
    query,
    () => pool.query<T>(query),
    (rewritten) => pool.query<T>(rewritten),
    () => getS3EndpointFromSession((sql) => pool.query(sql)),
    async () => {
      await pool.query('ROLLBACK');
    },
  );
}

/**
 * Execute a query with abort signal and automatic CORS proxy retry
 *
 * Similar to queryWithCorsRetry but supports abort signal
 *
 * @param pool The DuckDB connection pool
 * @param query The SQL query to execute
 * @param signal Abort signal for cancellation
 * @returns Query result with abort status
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
  return executeWithCorsRetry(
    query,
    () => pool.queryAbortable<T>(query, signal),
    (rewritten) => pool.queryAbortable<T>(rewritten, signal),
    () => getS3EndpointFromSession((sql) => pool.query(sql)),
    async () => {
      await pool.query('ROLLBACK');
    },
  );
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
  return executeWithCorsRetry(
    query,
    () => conn.query<T>(query),
    (rewritten) => conn.query<T>(rewritten),
    () => getS3EndpointFromSession((sql) => conn.query(sql)),
    async () => {
      await conn.query('ROLLBACK');
    },
  );
}
