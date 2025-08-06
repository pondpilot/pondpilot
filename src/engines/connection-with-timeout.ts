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

  async* stream(sql: string, params?: any[]): AsyncGenerator<any> {
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
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new ConnectionTimeoutError(this.timeoutMs)), this.timeoutMs);
    });

    return Promise.race([operation(), timeoutPromise]);
  }
}
