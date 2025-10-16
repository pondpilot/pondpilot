import { getQueryTimeoutMs } from '@models/app-config';

import { getLogger } from './debug-logger';
import { DatabaseConnection, QueryResult, PreparedStatement } from './types';

const logger = getLogger('database:tauri-connection');

export class TauriConnection implements DatabaseConnection {
  id: string;
  private invoke: any;
  private _isOpen = true;
  private _extensionsLoaded = false;
  private _attachedDbsLoaded = false;
  private _extensionsLoadingPromise: Promise<void> | null = null;
  private _attachedDbsLoadingPromise: Promise<void> | null = null;

  constructor(invoke: any, id: string) {
    this.invoke = invoke;
    this.id = id;
  }

  private static toError(err: any): Error {
    // Normalize various Tauri/IPC error shapes to a proper Error with readable message
    if (!err) return new Error('Unknown error');
    if (err instanceof Error) return err;
    if (typeof err === 'string') return new Error(err);

    // Check common error message locations in order of preference
    const message =
      err.message ||
      err.error?.message ||
      (err.code ? `${err.code}: ${err.message || ''}`.trim() : null);

    if (message && typeof message === 'string') {
      // Try to parse JSON-encoded error messages
      if (message.startsWith('{') || message.startsWith('[')) {
        try {
          const parsed = JSON.parse(message);
          if (parsed?.details?.message || parsed?.message) {
            return new Error(parsed.details?.message || parsed.message);
          }
        } catch {
          // Not valid JSON, use as-is
        }
      }
      return new Error(message);
    }

    // Fallback to stringifying the error object
    try {
      return new Error(JSON.stringify(err));
    } catch {
      return new Error(String(err));
    }
  }

  hasExtensionsLoaded(): boolean {
    return this._extensionsLoaded;
  }

  markExtensionsLoaded(): void {
    this._extensionsLoaded = true;
    this._extensionsLoadingPromise = null;
  }

  setExtensionsLoadingPromise(promise: Promise<void>): void {
    this._extensionsLoadingPromise = promise;
  }

  getExtensionsLoadingPromise(): Promise<void> | null {
    return this._extensionsLoadingPromise;
  }

  hasAttachedDbsLoaded(): boolean {
    return this._attachedDbsLoaded;
  }

  markAttachedDbsLoaded(): void {
    this._attachedDbsLoaded = true;
    this._attachedDbsLoadingPromise = null;
  }

  setAttachedDbsLoadingPromise(promise: Promise<void>): void {
    this._attachedDbsLoadingPromise = promise;
  }

  getAttachedDbsLoadingPromise(): Promise<void> | null {
    return this._attachedDbsLoadingPromise;
  }

  async execute(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this._isOpen) {
      throw new Error('Connection is closed');
    }

    logger.trace('TauriConnection.execute() called', {
      sql,
      connectionId: this.id,
      params,
    });

    try {
      // console.log(
      //   `[TauriConnection.execute] Invoking connection_execute for: ${sql.substring(0, 100)}...`,
      // );

      // Add a timeout to detect hanging queries
      const timeoutMs = getQueryTimeoutMs();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`Query execution timeout after ${timeoutMs} milliseconds`)),
          timeoutMs,
        );
      });

      const executePromise = this.invoke('connection_execute', {
        connectionId: this.id,
        sql,
        params: params || [],
        timeoutMs,
      });

      const result = await Promise.race([executePromise, timeoutPromise]);
      // console.log('[TauriConnection.execute] Result received:', result);
      logger.trace('TauriConnection.execute() result', { result });

      // Normalize the Tauri response to match our interface
      return {
        rows: result.rows,
        columns: result.columns.map((col: any) => ({
          name: col.name,
          type: col.type_name || col.type,
          type_name: col.type_name, // Preserve original type_name
          nullable: col.nullable,
        })),
        rowCount: result.row_count || result.rowCount || result.rows.length,
        row_count: result.row_count, // Keep for backward compatibility
        queryTime: result.execution_time_ms,
      };
    } catch (error) {
      const normalized = TauriConnection.toError(error);
      logger.error('TauriConnection.execute() failed', normalized);
      throw normalized;
    }
  }

  async *stream(sql: string, params?: any[]): AsyncGenerator<any> {
    if (!this._isOpen) {
      throw new Error('Connection is closed');
    }

    const _streamId = crypto.randomUUID();

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

    // FIX: Use backend's prepared statement infrastructure instead of SQL-level PREPARE/EXECUTE
    // This properly handles parameters via the sanitizer
    try {
      const statementId = await this.invoke('prepare_statement', { sql });

      return {
        id: statementId,
        query: async (params?: any[]) => {
          // FIX: Pass parameters to backend's execute_prepared_statement
          const result = await this.invoke('execute_prepared_statement', {
            statementId,
            params: params || [],
          });

          // Normalize the result to match our interface
          return {
            rows: result.rows,
            columns: result.columns.map((col: any) => ({
              name: col.name,
              type: col.type_name || col.type,
              type_name: col.type_name,
              nullable: col.nullable,
            })),
            rowCount: result.row_count || result.rowCount || result.rows.length,
            row_count: result.row_count,
            queryTime: result.execution_time_ms,
          };
        },
        close: async () => {
          // Clean up the prepared statement using backend command
          await this.invoke('close_prepared_statement', { statementId });
        },
      };
    } catch (error) {
      const normalized = TauriConnection.toError(error);
      logger.error('TauriConnection.prepare() failed', normalized);
      throw normalized;
    }
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
