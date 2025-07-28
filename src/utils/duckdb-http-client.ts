/**
 * DuckDB HTTP Server Client
 *
 * Client for interacting with DuckDB HTTP Server API
 */

export interface HttpServerConfig {
  host: string;
  port: number;
  protocol: 'http' | 'https';
  authType?: 'none' | 'basic' | 'token';
  username?: string;
  password?: string;
  token?: string;
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
}

export interface DatabaseSchema {
  tables: TableSchema[];
}

/**
 * Client for DuckDB HTTP Server
 */
export class DuckDBHttpClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: HttpServerConfig) {
    this.baseUrl = `${config.protocol}://${config.host}:${config.port}`;
    this.headers = {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Test connection to the HTTP server
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/`, {
        method: 'GET',
        headers: this.headers,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      return response.ok;
    } catch (error) {
      console.error('HTTP server connection test failed:', error);
      return false;
    }
  }

  /**
   * Execute a SQL query against the HTTP server
   */
  async executeQuery(sql: string): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: sql,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      // Log response status for debugging
      if (!response.ok) {
        console.error('Query failed:', response.status, response.statusText);
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Query error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}\n${errorText}`);
      }

      const text = await response.text();

      // Parse JSON Lines format
      const lines = text.trim().split('\n');
      const results: any[] = [];

      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            results.push(parsed);
          } catch (parseError) {
            console.warn('Failed to parse JSON line:', line, parseError);
          }
        }
      }

      return results;
    } catch (error) {
      console.error('Query execution failed:', error);
      throw error;
    }
  }

  /**
   * Get database schema information
   */
  async getSchema(): Promise<DatabaseSchema> {
    try {
      // Get table information using DuckDB system tables
      const tablesResult = await this.executeQuery(`
        SELECT table_name, schema_name 
        FROM duckdb_tables() 
        WHERE schema_name = 'main'
        ORDER BY schema_name, table_name
      `);

      // Get column information using DuckDB system tables
      const columnsResult = await this.executeQuery(`
        SELECT 
          table_name,
          column_name,
          data_type,
          is_nullable
        FROM duckdb_columns() 
        WHERE schema_name = 'main'
        ORDER BY table_name, column_index
      `);

      // Group columns by table
      const columnsByTable = new Map<string, ColumnSchema[]>();
      for (const col of columnsResult) {
        const tableName = col.table_name;
        if (!columnsByTable.has(tableName)) {
          columnsByTable.set(tableName, []);
        }
        columnsByTable.get(tableName)!.push({
          name: col.column_name,
          type: col.data_type,
          nullable: col.is_nullable === true,
        });
      }

      // Build table schemas
      const tables: TableSchema[] = [];
      for (const table of tablesResult) {
        const tableName = table.table_name;
        const columns = columnsByTable.get(tableName) || [];
        tables.push({
          name: tableName,
          columns,
        });
      }

      return { tables };
    } catch (error) {
      console.error('Failed to get schema:', error);
      throw error;
    }
  }

  /**
   * Get data from a specific table
   */
  async getTableData(tableName: string, limit = 1000): Promise<any[]> {
    const sql = `SELECT * FROM ${tableName} LIMIT ${limit}`;
    return this.executeQuery(sql);
  }

  /**
   * Build HTTP URL for a table query (for use in DuckDB views)
   */
  buildTableQueryUrl(tableName: string): string {
    const sql = `SELECT * FROM ${tableName}`;
    const params = new URLSearchParams({ query: sql });
    return `${this.baseUrl}/?${params.toString()}`;
  }
}

/**
 * Create DuckDB HTTP client from configuration
 */
export function createHttpClient(config: HttpServerConfig): DuckDBHttpClient {
  return new DuckDBHttpClient(config);
}
