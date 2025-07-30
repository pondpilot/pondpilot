import { MDConnection } from '@motherduck/wasm-client';
import { MotherDuckDB } from '@models/data-source';

/**
 * MotherDuck connection manager for handling browser-to-cloud connections
 */
export class MotherDuckConnectionManager {
  private connections = new Map<string, MDConnection>();

  /**
   * Create a new MotherDuck connection
   * @param token - MotherDuck access token
   * @returns Promise<MDConnection>
   */
  async connect(token: string): Promise<MDConnection> {
    try {
      const connection = await MDConnection.create({
        mdToken: token,
      });

      return connection;
    } catch (error) {
      throw new Error(`MotherDuck connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Test a MotherDuck connection without storing it
   * @param token - MotherDuck access token
   * @returns Promise<boolean>
   */
  async testConnection(token: string): Promise<boolean> {
    try {
      const conn = await this.connect(token);
      const result = await conn.evaluateQuery('SELECT 1 as test');
      await conn.close(); // Clean up test connection
      return result !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get or create a connection for a MotherDuck data source
   * @param dataSource - MotherDuck data source configuration
   * @returns Promise<MDConnection>
   */
  async getConnection(dataSource: MotherDuckDB): Promise<MDConnection> {
    const existingConnection = this.connections.get(dataSource.id);
    if (existingConnection) {
      try {
        // Test if connection is still alive
        await existingConnection.evaluateQuery('SELECT 1');
        return existingConnection;
      } catch {
        // Connection is dead, remove it and create new one
        this.connections.delete(dataSource.id);
      }
    }

    const connection = await this.connect(dataSource.token);
    this.connections.set(dataSource.id, connection);
    return connection;
  }

  /**
   * List available databases in MotherDuck
   * @param token - MotherDuck access token
   * @returns Promise<string[]>
   */
  async listDatabases(token: string): Promise<string[]> {
    const connection = await this.connect(token);
    
    try {
      const result = await connection.evaluateQuery(`
        SELECT database_name 
        FROM duckdb_databases() 
        WHERE database_name != 'system'
        ORDER BY database_name
      `);
      
      const databases = result.data.toRows().map((row: any) => row.database_name as string);
      await connection.close();
      return databases;
    } catch (error) {
      await connection.close();
      throw new Error(`Failed to list databases: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List tables in a specific database
   * @param dataSource - MotherDuck data source
   * @returns Promise<string[]>
   */
  async listTables(dataSource: MotherDuckDB): Promise<string[]> {
    const connection = await this.getConnection(dataSource);
    
    try {
      const query = dataSource.database
        ? `SELECT table_name FROM ${dataSource.database}.information_schema.tables WHERE table_schema != 'information_schema' ORDER BY table_name`
        : `SHOW TABLES`;
      
      const result = await connection.evaluateQuery(query);
      return result.data.toRows().map((row: any) => row.table_name as string);
    } catch (error) {
      throw new Error(`Failed to list tables: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute a query on MotherDuck
   * @param dataSource - MotherDuck data source
   * @param query - SQL query to execute
   * @returns Promise<any>
   */
  async executeQuery(dataSource: MotherDuckDB, query: string): Promise<any> {
    const connection = await this.getConnection(dataSource);
    
    try {
      // Prefix with database USE statement if specified
      const prefixedQuery = dataSource.database 
        ? `USE ${dataSource.database}; ${query}`
        : query;
      
      return await connection.evaluateQuery(prefixedQuery);
    } catch (error) {
      throw new Error(`Query execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Close a specific connection
   * @param dataSourceId - Data source ID
   */
  async closeConnection(dataSourceId: string): Promise<void> {
    const connection = this.connections.get(dataSourceId);
    if (connection) {
      try {
        await connection.close();
      } catch {
        // Ignore close errors
      }
      this.connections.delete(dataSourceId);
    }
  }

  /**
   * Close all connections
   */
  async closeAllConnections(): Promise<void> {
    const promises = Array.from(this.connections.values()).map(async (connection) => {
      try {
        await connection.close();
      } catch {
        // Ignore close errors
      }
    });
    
    await Promise.all(promises);
    this.connections.clear();
  }
}

// Global instance for reuse across the application
export const motherDuckConnectionManager = new MotherDuckConnectionManager();