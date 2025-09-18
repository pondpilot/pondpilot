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

    // Validate on THIS connection so attached catalogs are visible.
    // Use a real connection-level prepared statement to avoid executing the query.
    const prepName = `pp_${crypto.randomUUID().replace(/-/g, '_')}`;

    // Ensure attachments are present on this connection (mirrors pool streaming setup)
    try {
      const { buildAttachSpec, buildAttachStatements } = await import('./tauri-attach');
      const spec = await buildAttachSpec();
      const stmts = buildAttachStatements(spec);
      if (stmts.length > 0) {
        await this.execute(stmts.join(';\n'));
      }
    } catch (e) {
      logger.debug('Failed to apply attachments before PREPARE', e);
    }

    // Prepare on this connection; DuckDB syntax supports PREPARE name AS <sql>
    try {
      await this.execute(`PREPARE ${prepName} AS ${sql}`);
    } catch (e) {
      const msg = (e as Error).message || '';
      // Retry once after reapplying attachments if we hit missing catalog errors
      if (/Catalog\s+".*"\s+does\s+not\s+exist/i.test(msg)) {
        // eslint-disable-next-line no-useless-catch
        try {
          const { buildAttachSpec, buildAttachStatements } = await import('./tauri-attach');
          const spec = await buildAttachSpec();
          const stmts = buildAttachStatements(spec);
          if (stmts.length > 0) {
            logger.debug('[TauriConnection] Re-applying attachments due to missing catalog');
            await this.execute(stmts.join(';\n'));
          }
          try {
            await this.execute(`PREPARE ${prepName} AS ${sql}`);
          } catch (e2) {
            // Fallback: if missing catalog persists, attempt backend attach via connections API
            const err2 = (e2 as Error).message || '';
            if (/Catalog\s+"(.*?)"\s+does\s+not\s+exist/i.test(err2)) {
              const m = err2.match(/Catalog\s+"(.*?)"\s+does\s+not\s+exist/i);
              const alias = m ? m[1] : undefined;
              if (alias) {
                // eslint-disable-next-line no-useless-catch
                try {
                  const { useAppStore } = await import('../store/app-store');
                  const state = useAppStore.getState();
                  // Find a remote-db with this dbName and a connectionId
                  const ds = Array.from(state.dataSources.values()).find(
                    (d: any) => d?.type === 'remote-db' && d?.dbName === alias && d?.connectionId,
                  ) as any;
                  if (ds?.connectionId) {
                    logger.debug(
                      '[TauriConnection] Backend attach via connections API for alias',
                      alias,
                    );
                    const { ConnectionsAPI } = await import('../services/connections-api');
                    await ConnectionsAPI.attachRemoteDatabase(ds.connectionId, alias);
                    // Retry prepare after backend attachment (which also registers for future connections)
                    await this.execute(`PREPARE ${prepName} AS ${sql}`);
                  } else {
                    // As a broader fallback, attach all connectionId-based remotes and retry once
                    const allConnRemotes = Array.from(state.dataSources.values()).filter(
                      (d: any) => d?.type === 'remote-db' && d?.connectionId,
                    ) as any[];
                    if (allConnRemotes.length > 0) {
                      const { ConnectionsAPI } = await import('../services/connections-api');
                      logger.debug(
                        '[TauriConnection] Attaching all connection-based remotes as fallback',
                      );
                      for (const r of allConnRemotes) {
                        try {
                          await ConnectionsAPI.attachRemoteDatabase(r.connectionId, r.dbName);
                        } catch (attachErr) {
                          logger.debug(
                            `[TauriConnection] attachRemoteDatabase failed for ${r.dbName}`,
                            attachErr,
                          );
                        }
                      }
                      await this.execute(`PREPARE ${prepName} AS ${sql}`);
                    } else {
                      throw e2;
                    }
                  }
                } catch (e3) {
                  throw e3;
                }
              } else {
                throw e2;
              }
            } else {
              throw e2;
            }
          }
        } catch (inner) {
          throw inner;
        }
      } else {
        throw e;
      }
    }

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
