import { ConnectionPool, DatabaseConnection } from './types';
import { TauriConnection } from './tauri-connection';

export class TauriConnectionPool implements ConnectionPool {
  private maxPoolSize: number;
  private connections: TauriConnection[] = [];
  private availableConnections: TauriConnection[] = [];
  private invoke: any;

  constructor(invoke: any, maxPoolSize: number) {
    this.invoke = invoke;
    this.maxPoolSize = maxPoolSize;
  }

  async acquire(): Promise<DatabaseConnection> {
    // If we have available connections, return one
    if (this.availableConnections.length > 0) {
      const conn = this.availableConnections.pop()!;
      return conn;
    }

    // If we haven't reached max pool size, create a new connection
    if (this.connections.length < this.maxPoolSize) {
      const connId = await this.invoke('create_connection');
      const conn = new TauriConnection(this.invoke, connId);
      this.connections.push(conn);
      return conn;
    }

    // Otherwise wait for a connection to become available
    return new Promise((resolve) => {
      const checkAvailable = setInterval(() => {
        if (this.availableConnections.length > 0) {
          clearInterval(checkAvailable);
          resolve(this.availableConnections.pop()!);
        }
      }, 100);
    });
  }

  async release(connection: DatabaseConnection): Promise<void> {
    const tauriConn = connection as TauriConnection;
    if (tauriConn.isOpen()) {
      this.availableConnections.push(tauriConn);
    }
  }

  async close(): Promise<void> {
    // Close all connections
    await Promise.all(this.connections.map(conn => conn.close()));
    this.connections = [];
    this.availableConnections = [];
  }

  getActiveConnections(): number {
    return this.connections.length - this.availableConnections.length;
  }

  getTotalConnections(): number {
    return this.connections.length;
  }

  async destroy(): Promise<void> {
    await this.close();
  }

  size(): number {
    return this.connections.length;
  }

  available(): number {
    return this.availableConnections.length;
  }
}