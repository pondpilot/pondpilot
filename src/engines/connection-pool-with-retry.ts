import { ConnectionWithTimeout } from './connection-with-timeout';
import { getLogger } from './debug-logger';
import { isRecoverableError } from './errors';
import { ConnectionPool, DatabaseConnection, PoolStats } from './types';

export { ConnectionWithTimeout } from './connection-with-timeout';

const logger = getLogger('database:pool-retry');

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 100,
  maxDelay: 5000,
  backoffMultiplier: 2,
};

/**
 * Connection pool wrapper that adds retry logic for recoverable errors
 */
export class ConnectionPoolWithRetry implements ConnectionPool {
  constructor(
    private readonly pool: ConnectionPool,
    private readonly config: RetryConfig = DEFAULT_RETRY_CONFIG,
  ) {}

  async acquire(): Promise<DatabaseConnection> {
    return this.withRetry(() => this.pool.acquire());
  }

  async release(connection: DatabaseConnection): Promise<void> {
    // Don't retry release operations
    return this.pool.release(connection);
  }

  async query<T = any>(sql: string): Promise<T> {
    const conn = await this.acquire();
    try {
      const result = await conn.execute(sql);
      return result as T;
    } finally {
      await this.release(conn);
    }
  }

  async close(): Promise<void> {
    return this.pool.close();
  }

  getStats(): PoolStats | null {
    return this.pool.getStats?.() ?? null;
  }

  /**
   * Execute an operation with exponential backoff retry logic
   */
  private async withRetry<T>(operation: () => Promise<T>, attempt: number = 0): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      // Check if the error is recoverable and we haven't exceeded max retries
      if (!isRecoverableError(error) || attempt >= this.config.maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        this.config.initialDelay * this.config.backoffMultiplier ** attempt,
        this.config.maxDelay,
      );

      // Log retry attempt
      logger.warn('Retrying operation', {
        delay,
        attempt: attempt + 1,
        maxRetries: this.config.maxRetries,
        error,
      });

      // Wait before retrying
      await this.delay(delay);

      // Retry the operation
      return this.withRetry(operation, attempt + 1);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create a connection pool with retry and timeout capabilities
 */
export function createResilientConnectionPool(
  pool: ConnectionPool,
  options?: {
    retry?: Partial<RetryConfig>;
    timeoutMs?: number;
  },
): ConnectionPool {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...options?.retry };
  const poolWithRetry = new ConnectionPoolWithRetry(pool, retryConfig);

  // If timeout is specified, wrap connections with timeout logic
  if (options?.timeoutMs) {
    // FIX: Use WeakMap to track wrapper-to-original connection mappings
    // This preserves pool invariants by unwrapping before passing to pool.release()
    const wrapperMap = new WeakMap<DatabaseConnection, DatabaseConnection>();

    return {
      acquire: async () => {
        const original = await poolWithRetry.acquire();
        const wrapper = new ConnectionWithTimeout(original, options.timeoutMs);
        // Track the mapping so we can unwrap on release
        wrapperMap.set(wrapper, original);
        return wrapper;
      },
      release: (connection: DatabaseConnection) => {
        // FIX: Unwrap the connection before passing to pool
        // This ensures the pool receives the original connection object it knows about
        const original = wrapperMap.get(connection) ?? connection;
        wrapperMap.delete(connection);
        return poolWithRetry.release(original);
      },
      query: (sql: string) => poolWithRetry.query(sql),
      close: () => poolWithRetry.close(),
      getStats: () => poolWithRetry.getStats(),
    };
  }

  return poolWithRetry;
}
