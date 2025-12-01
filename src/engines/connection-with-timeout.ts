import { ConnectionTimeoutError } from './errors';
import { DatabaseConnection } from './types';

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

  private async withTimeout<T>(operation: () => Promise<T>, _timeoutMessage: string): Promise<T> {
    // FIX: Clear timeout timer to prevent resource leaks and unhandled rejections
    let timerId: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => {
          reject(new ConnectionTimeoutError(this.timeoutMs));
        }, this.timeoutMs);
      });

      const result = await Promise.race([operation(), timeoutPromise]);
      return result;
    } finally {
      // Always clear timeout to prevent timer leak
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
    }

    // NOTE: This only detects timeouts, it does NOT cancel the underlying operation
    // DuckDB operations continue running after timeout until completion
    // True cancellation would require:
    // 1. AbortSignal support in DatabaseConnection interface
    // 2. DuckDB interrupt handles (not available in DuckDB 1.3.0)
    // For now, this prevents timer leaks and provides timeout detection
  }
}
