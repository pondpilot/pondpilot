import { DatabaseConnection, QueryResult, PreparedStatement } from './types';

export class TauriConnection implements DatabaseConnection {
  id: string;
  private invoke: any;
  private _isOpen = true;

  constructor(invoke: any, id: string) {
    this.invoke = invoke;
    this.id = id;
  }

  async execute(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this._isOpen) {
      throw new Error('Connection is closed');
    }

    console.log('TauriConnection.execute() called:', { sql, connectionId: this.id, params });

    try {
      const result = await this.invoke('connection_execute', {
        connectionId: this.id,
        sql,
        params: params || [],
      });
      console.log('TauriConnection.execute() result:', result);

      // Normalize the Tauri response to match our interface
      return {
        rows: result.rows,
        columns: result.columns.map((col: any) => ({
          name: col.name,
          type: col.type_name || col.type,
          nullable: col.nullable,
        })),
        rowCount: result.row_count || result.rowCount || result.rows.length,
        row_count: result.row_count, // Keep for backward compatibility
        queryTime: result.execution_time_ms,
      };
    } catch (error) {
      console.error('TauriConnection.execute() failed:', error);
      throw error;
    }
  }

  async *stream(sql: string, params?: any[]): AsyncGenerator<any> {
    if (!this._isOpen) {
      throw new Error('Connection is closed');
    }

    const streamId = crypto.randomUUID();

    // This would need to be implemented with Tauri events
    // For now, just execute and yield all results
    const result = await this.execute(sql, params);
    for (const row of result.rows) {
      yield row;
    }
  }

  async prepare(sql: string): Promise<PreparedStatement> {
    if (!this._isOpen) {
      throw new Error('Connection is closed');
    }

    const stmtId = await this.invoke('prepare_statement', {
      sql,
    });

    return {
      id: stmtId,
      query: async (params?: any[]) => {
        return this.invoke('prepared_statement_execute', {
          statementId: stmtId,
          params: params || [],
        });
      },
      close: async () => {
        await this.invoke('prepared_statement_close', {
          statementId: stmtId,
        });
      },
    };
  }

  async close(): Promise<void> {
    if (this._isOpen) {
      await this.invoke('connection_close', {
        connectionId: this.id,
      });
      this._isOpen = false;
    }
  }

  isOpen(): boolean {
    return this._isOpen;
  }
}
