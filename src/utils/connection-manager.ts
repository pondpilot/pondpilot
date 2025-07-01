/**
 * Connection Manager Utilities
 *
 * Utilities for managing database connections with timeouts and retries
 */

import { escapeSqlString } from '@components/ai-shared/utils/sql-escape';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';

import { ConnectionTimeoutError, MaxRetriesExceededError } from './connection-errors';

// Re-export error types for convenience
export { ConnectionTimeoutError, MaxRetriesExceededError } from './connection-errors';

/**
 * Configuration for connection attempts
 */
export interface ConnectionConfig {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Timeout in milliseconds for each connection attempt */
  timeout?: number;
  /** Delay between retry attempts in milliseconds */
  retryDelay?: number;
  /** Whether to use exponential backoff for retries */
  exponentialBackoff?: boolean;
}

const DEFAULT_CONFIG: Required<ConnectionConfig> = {
  maxRetries: 3,
  timeout: 30000, // 30 seconds
  retryDelay: 1000, // 1 second
  exponentialBackoff: true,
};

/**
 * Execute a query with timeout
 */
async function queryWithTimeout<T>(
  pool: AsyncDuckDBConnectionPool,
  query: string,
  timeoutMs: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let completed = false;

    // Set up the timeout
    const timeoutId = setTimeout(() => {
      if (!completed) {
        completed = true;
        reject(new ConnectionTimeoutError(`Query timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    // Execute the query
    pool
      .query(query)
      .then((result) => {
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          resolve(result as T);
        }
      })
      .catch((error) => {
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      });
  });
}

/**
 * Calculate retry delay with optional exponential backoff
 */
function calculateRetryDelay(
  attempt: number,
  baseDelay: number,
  exponentialBackoff: boolean,
): number {
  if (!exponentialBackoff) {
    return baseDelay;
  }

  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * 2 ** (attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
  return Math.min(exponentialDelay + jitter, 60000); // Cap at 60 seconds
}

/**
 * Execute a database connection with retries and timeout
 */
export async function executeWithRetry<T>(
  pool: AsyncDuckDBConnectionPool,
  query: string,
  config?: ConnectionConfig,
): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= finalConfig.maxRetries; attempt += 1) {
    try {
      // Attempt the query with timeout
      const result = await queryWithTimeout<T>(pool, query, finalConfig.timeout);
      return result;
    } catch (error) {
      lastError = error as Error;

      // If it's a timeout error and we have retries left, wait and retry
      if (error instanceof ConnectionTimeoutError && attempt < finalConfig.maxRetries) {
        const delay = calculateRetryDelay(
          attempt,
          finalConfig.retryDelay,
          finalConfig.exponentialBackoff,
        );

        console.warn(
          `Connection attempt ${attempt} failed with timeout. Retrying in ${delay}ms...`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // For non-timeout errors or if we're out of retries, throw
      if (attempt === finalConfig.maxRetries) {
        throw new MaxRetriesExceededError(attempt, lastError);
      }

      // For non-timeout errors, throw immediately
      throw error;
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new MaxRetriesExceededError(finalConfig.maxRetries, lastError!);
}

/**
 * Test a remote database connection with timeout
 */
export async function testRemoteConnection(
  pool: AsyncDuckDBConnectionPool,
  dbName: string,
  config?: ConnectionConfig,
): Promise<boolean> {
  try {
    // Use a simple query that should work on any database
    const testQuery = `SELECT 1 FROM information_schema.schemata WHERE catalog_name = '${escapeSqlString(dbName)}' LIMIT 1`;
    await executeWithRetry(pool, testQuery, config);
    return true;
  } catch (error) {
    if (error instanceof MaxRetriesExceededError) {
      console.error(
        `Failed to connect to database '${dbName}' after ${error.attempts} attempts:`,
        error.lastError.message,
      );
    }
    return false;
  }
}

/**
 * Execute an ATTACH statement with retries and timeout
 */
export async function attachDatabaseWithRetry(
  pool: AsyncDuckDBConnectionPool,
  attachQuery: string,
  config?: ConnectionConfig,
): Promise<void> {
  try {
    await executeWithRetry<void>(pool, attachQuery, config);
  } catch (error) {
    if (error instanceof MaxRetriesExceededError) {
      throw new Error(
        `Failed to attach database after ${error.attempts} attempts: ${error.lastError.message}`,
      );
    }
    throw error;
  }
}
