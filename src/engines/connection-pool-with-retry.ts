import { getLogger } from './debug-logger';
import { ConnectionTimeoutError, isRecoverableError } from './errors';
import { ConnectionPool, DatabaseConnection, PoolStats } from './types';

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
 * Connection wrapper that adds timeout logic
 */
export class ConnectionWithTimeout implements DatabaseConnection {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly timeoutMs: number = 30000,
  ) {}

  get id(): string {
    return this.connection.id;
  }

  async execute(sql: string, params?: any[]): Promise<any> {
    return this.withTimeout(
      () => this.connection.execute(sql, params),
      `Query execution timed out after ${this.timeoutMs}ms`,
    );
  }

  async *stream(sql: string, params?: any[]): AsyncGenerator<any> {
    // Note: Timeout logic for streaming is more complex and would require
    // cancellation tokens. For now, delegate directly to the connection.
    yield* this.connection.stream(sql, params);
  }

  async prepare(sql: string): Promise<any> {
    return this.withTimeout(
      () => this.connection.prepare(sql),
      `Statement preparation timed out after ${this.timeoutMs}ms`,
    );
  }

  async close(): Promise<void> {
    return this.connection.close();
  }

  isOpen(): boolean {
    return this.connection.isOpen();
  }

  private async withTimeout<T>(operation: () => Promise<T>, timeoutMessage: string): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new ConnectionTimeoutError(this.timeoutMs)), this.timeoutMs);
    });

    return Promise.race([operation(), timeoutPromise]);
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
    return {
      acquire: async () => {
        const connection = await poolWithRetry.acquire();
        return new ConnectionWithTimeout(connection, options.timeoutMs);
      },
      release: (connection: DatabaseConnection) => poolWithRetry.release(connection),
      query: (sql: string) => poolWithRetry.query(sql),
      close: () => poolWithRetry.close(),
      getStats: () => poolWithRetry.getStats(),
    };
  }

  return poolWithRetry;
}
