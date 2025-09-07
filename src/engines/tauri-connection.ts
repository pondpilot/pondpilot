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

  constructor(invoke: any, id: string) {
    this.invoke = invoke;
    this.id = id;
  }

  private static toError(err: any): Error {
    // Normalize various Tauri/IPC error shapes to a proper Error with readable message
    try {
      if (!err) return new Error('Unknown error');
      if (err instanceof Error) return err;
      if (typeof err === 'string') return new Error(err);
      // Tauri often returns objects with a message or nested error
      const messageCandidates: any[] = [
        err.message,
        err.error?.message,
        err.code ? `${err.code}: ${err.message || ''}`.trim() : undefined,
      ];
      for (const m of messageCandidates) {
        if (!m) continue;
        if (typeof m === 'string' && m.length > 0) {
          // Some messages are JSON-encoded strings
          try {
            const parsed = JSON.parse(m);
            if (parsed && typeof parsed === 'object') {
              const inner = parsed.details?.message || parsed.message || m;
              return new Error(String(inner));
            }
          } catch {
            // not JSON -> use as-is
          }
          return new Error(m);
        }
        try {
          return new Error(JSON.stringify(m));
        } catch {
          // ignore and continue
        }
      }
      try {
        return new Error(JSON.stringify(err));
      } catch {
        return new Error(String(err));
      }
    } catch {
      return new Error(String(err));
    }
  }

  hasExtensionsLoaded(): boolean {
    return this._extensionsLoaded;
  }

  markExtensionsLoaded(): void {
    this._extensionsLoaded = true;
  }

  hasAttachedDbsLoaded(): boolean {
    return this._attachedDbsLoaded;
  }

  markAttachedDbsLoaded(): void {
    this._attachedDbsLoaded = true;
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

    // Validate on THIS connection so attached catalogs are visible.
    // Use a real connection-level prepared statement to avoid executing the query.
    const prepName = `pp_${crypto.randomUUID().replace(/-/g, '_')}`;

    // Prepare on this connection; DuckDB syntax supports PREPARE name AS <sql>
    await this.execute(`PREPARE ${prepName} AS ${sql}`);

    return {
      id: prepName,
      query: async (_params?: any[]) => {
        // Execute the prepared statement on this same connection
        return this.execute(`EXECUTE ${prepName}`);
      },
      close: async () => {
        // Clean up the prepared statement on this connection
        await this.execute(`DEALLOCATE PREPARE ${prepName}`);
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
