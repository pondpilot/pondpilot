import { DuckDBWasmConnection } from './duckdb-wasm-connection';
import type { DuckDBWasmEngine } from './duckdb-wasm-engine';
import { ConnectionPool, DatabaseConnection } from './types';

export class DuckDBWasmConnectionPool implements ConnectionPool {
  private connections: DuckDBWasmConnection[] = [];
  private availableConnections: DuckDBWasmConnection[] = [];
  private waitQueue: Array<(conn: DuckDBWasmConnection) => void> = [];

  constructor(
    private engine: DuckDBWasmEngine,
    private maxSize: number,
  ) {}

  async initialize(): Promise<void> {
    // Pre-create some connections
    const initialSize = Math.min(5, this.maxSize);
    for (let i = 0; i < initialSize; i += 1) {
      const conn = await this.engine.createConnection();
      this.connections.push(conn as DuckDBWasmConnection);
      this.availableConnections.push(conn as DuckDBWasmConnection);
    }
  }

  async acquire(): Promise<DatabaseConnection> {
    // If we have available connections, return one
    if (this.availableConnections.length > 0) {
      return this.availableConnections.pop()!;
    }

    // If we haven't reached max size, create a new connection
    if (this.connections.length < this.maxSize) {
      const conn = await this.engine.createConnection();
      this.connections.push(conn as DuckDBWasmConnection);
      return conn;
    }

    // Otherwise, wait for a connection to be released
    return new Promise((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  async release(connection: DatabaseConnection): Promise<void> {
    const conn = connection as DuckDBWasmConnection;

    // If someone is waiting, give them the connection
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()!;
      waiter(conn);
    } else {
      // Otherwise, add it back to available pool
      this.availableConnections.push(conn);
    }
  }

  async destroy(): Promise<void> {
    // Close all connections
    const closePromises = this.connections.map((conn) => conn.close());
    await Promise.all(closePromises);

    // Clear arrays
    this.connections = [];
    this.availableConnections = [];

    // Reject any waiters
    this.waitQueue.forEach((waiter) => {
      // Create a dummy error connection
      const errorConn = {
        id: 'error',
        execute: () => Promise.reject(new Error('Pool destroyed')),
        async *stream() {
          yield;
          throw new Error('Pool destroyed');
        },
        prepare: () => Promise.reject(new Error('Pool destroyed')),
        close: () => Promise.resolve(),
        isOpen: () => false,
      } as DatabaseConnection;
      waiter(errorConn as DuckDBWasmConnection);
    });
    this.waitQueue = [];
  }

  size(): number {
    return this.connections.length;
  }

  available(): number {
    return this.availableConnections.length;
  }
}
