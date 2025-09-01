import { showError, showErrorWithAction, showSuccess } from '@components/app-notifications';
import { persistPutDataSources, persistDeleteDataSource } from '@controllers/data-source/persist';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { syncFiles } from '@controllers/file-system';
import { updateSQLScriptContent } from '@controllers/sql-script';
import {
  updateScriptTabLastExecutedQuery,
  updateScriptTabLayout,
  clearTabExecutionError,
  setTabExecutionError,
} from '@controllers/tab';
import { PreparedStatement } from '@engines/types';
import { useInitializedDatabaseConnectionPool } from '@features/database-context';
import { ScriptEditor } from '@features/script-editor';
import { useEditorPreferences } from '@hooks/use-editor-preferences';
import { RemoteDB } from '@models/data-source';
import { ScriptExecutionState } from '@models/sql-script';
import { ScriptTab, TabId } from '@models/tab';
import { useAppStore, useProtectedViews, useTabReactiveState } from '@store/app-store';
import { makePersistentDataSourceId } from '@utils/data-source';
import {
  splitSQLByStats,
  classifySQLStatements,
  validateStatements,
  SelectableStatements,
  SQLStatement,
  SQLStatementType,
} from '@utils/editor/sql';
import { formatSQLSafe } from '@utils/sql-formatter';
import { Allotment } from 'allotment';
import { memo, useCallback, useState, useEffect } from 'react';

import { DataView, DataViewInfoPane } from '../components';
import { useDataAdapter } from '../hooks/use-data-adapter';

interface ScriptTabViewProps {
  tabId: TabId;
  active: boolean;
}

export const ScriptTabView = memo(({ tabId, active }: ScriptTabViewProps) => {
  // Get the reactive portion of tab state
  const tab = useTabReactiveState<ScriptTab>(tabId, 'script');

  // We have to use an additional increasing counter, becuase we
  // want to force re-rendering when a new script executed successfully
  // even if with the exact same last executed query. But out tab state
  // accessor is clever and will not trigger in this case, because
  // it uses shallow object comparison.
  const [scriptVersion, setScriptVersion] = useState<number>(0);
  const incrementScriptVersion = useCallback(() => {
    setScriptVersion((prev) => prev + 1);
  }, []);

  // Get the data adapter
  const dataAdapter = useDataAdapter({ tab, sourceVersion: scriptVersion });

  // Neither of the following checks should be necessary as this is called
  // from the tab view which gets the ids from the same map in the store
  // and dispatches on the tab type. But we are being very robust here.

  const [scriptExecutionState, setScriptExecutionState] = useState<ScriptExecutionState>('idle');

  // Monitor data adapter errors and update script execution state
  useEffect(() => {
    if (dataAdapter.dataSourceError.length > 0) {
      // Only update if we're currently showing success
      if (scriptExecutionState === 'success') {
        setScriptExecutionState('error');
        // Show error notification for streaming errors
        showError({
          title: 'Query execution failed',
          message: dataAdapter.dataSourceError.join('\n'),
        });
      }
    }
  }, [dataAdapter.dataSourceError, scriptExecutionState]);

  const pool = useInitializedDatabaseConnectionPool();
  const protectedViews = useProtectedViews();
  const { preferences } = useEditorPreferences();

  const runScriptQuery = useCallback(
    async (query: string) => {
      setScriptExecutionState('running');

      // Format query if preference is enabled
      let queryToExecute = query;
      if (preferences.formatOnRun) {
        const formatResult = formatSQLSafe(query);
        if (formatResult.success) {
          queryToExecute = formatResult.result;
          // Update the editor with formatted SQL
          const sqlScript = useAppStore.getState().sqlScripts.get(tab.sqlScriptId);
          if (sqlScript && sqlScript.content !== queryToExecute) {
            // Update the script content with formatted SQL
            updateSQLScriptContent(sqlScript, queryToExecute);
            showSuccess({
              title: 'Query auto-formatted',
              message: '',
              autoClose: 1500,
              id: 'sql-auto-format',
            });
          }
        }
      }
      // Parse query into statements
      const statements = splitSQLByStats(queryToExecute);

      // Classify statements
      const classifiedStatements = classifySQLStatements(statements);

      // Check if the statements are valid
      const errors = validateStatements(classifiedStatements, protectedViews);
      if (errors.length > 0) {
        // Errors in SQL statements - user is notified via showError
        setScriptExecutionState('error');
        showError({
          title: 'Error in SQL statements',
          message: errors.join('\n'),
        });
        return;
      }

      // Query to be used in data adapter and saved to the store
      let lastExecutedQuery: string | null = null;

      // Get a connection from the pool for the entire operation
      const conn = await pool.acquire();

      const runQueryWithFileSyncAndRetry = async (code: string) => {
        try {
          await conn.execute(code);
        } catch (error: any) {
          if (error.message?.includes('NotReadableError')) {
            await syncFiles(pool);
            await conn.execute(code);
          } else {
            throw error;
          }
        }
      };

      const prepQueryWithFileSyncAndRetry = async (code: string): Promise<PreparedStatement> => {
        try {
          return await conn.prepare(code);
        } catch (error: any) {
          if (error.message?.includes('NotReadableError')) {
            await syncFiles(pool);
            return conn.prepare(code);
          }
          throw error;
        }
      };

      try {
        // No need transaction if there is only one statement
        const needsTransaction =
          classifiedStatements.length > 1 && classifiedStatements.some((s) => s.needsTransaction);

        if (needsTransaction) {
          await conn.execute('BEGIN TRANSACTION');
        }

        // Execute each statement except the last one
        const statsExceptLast = classifiedStatements.slice(0, -1);
        for (const statement of statsExceptLast) {
          try {
            await runQueryWithFileSyncAndRetry(statement.code);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (needsTransaction) {
              await conn.execute('ROLLBACK');
            }
            // Error executing statement - user is notified via showErrorWithAction
            setScriptExecutionState('error');
            setTabExecutionError(tabId, {
              errorMessage: message,
              statementType: statement.type,
              timestamp: Date.now(),
            });
            showErrorWithAction({
              title: 'Error executing SQL statement',
              message: `Error in ${statement.type} statement: ${message}`,
              action: {
                label: 'Fix with AI',
                onClick: () => {
                  // Dispatch custom event to trigger AI Assistant
                  const event = new CustomEvent('trigger-ai-assistant', {
                    detail: { tabId },
                  });
                  window.dispatchEvent(event);
                },
              },
            });
            return;
          }
        }

        const lastStatement = classifiedStatements[classifiedStatements.length - 1];
        if (SelectableStatements.includes(lastStatement.type)) {
          // Validate last SELECT statement via prepare
          try {
            const preparedStatement = await prepQueryWithFileSyncAndRetry(lastStatement.code);
            await preparedStatement.close();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            if (needsTransaction) {
              await conn.execute('ROLLBACK');
            }
            // Creation of a prepared statement for the last SELECT statement failed - user is notified
            setScriptExecutionState('error');
            setTabExecutionError(tabId, {
              errorMessage: message,
              statementType: lastStatement.type,
              timestamp: Date.now(),
            });
            showErrorWithAction({
              title: 'Error executing SQL statement',
              message: `Error in ${lastStatement.type} statement: ${message}`,
              action: {
                label: 'Fix with AI',
                onClick: () => {
                  // Dispatch custom event to trigger AI Assistant
                  const event = new CustomEvent('trigger-ai-assistant', {
                    detail: { tabId },
                  });
                  window.dispatchEvent(event);
                },
              },
            });
            return;
          }
          lastExecutedQuery = lastStatement.code;
        } else {
          // The last statement is not a SELECT statement
          // Execute it immediately
          try {
            await runQueryWithFileSyncAndRetry(lastStatement.code);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (needsTransaction) {
              await conn.execute('ROLLBACK');
            }
            // Error executing last non-SELECT statement - user is notified via showErrorWithAction
            setScriptExecutionState('error');
            setTabExecutionError(tabId, {
              errorMessage: message,
              statementType: lastStatement.type,
              timestamp: Date.now(),
            });
            showErrorWithAction({
              title: 'Error executing SQL statement',
              message: `Error in ${lastStatement.type} statement: ${message}`,
              action: {
                label: 'Fix with AI',
                onClick: () => {
                  // Dispatch custom event to trigger AI Assistant
                  const event = new CustomEvent('trigger-ai-assistant', {
                    detail: { tabId },
                  });
                  window.dispatchEvent(event);
                },
              },
            });
            return;
          }
          lastExecutedQuery = "SELECT 'All statements executed successfully' as Result";
        }

        // All statements executed successfully
        if (needsTransaction) {
          await conn.execute('COMMIT');
        }

        // Check if any DDL or database operations were executed and refresh metadata
        const hasDDL = classifiedStatements.some((s) => s.sqlType === SQLStatementType.DDL);
        const hasAttachDetach = classifiedStatements.some(
          (s) => s.type === SQLStatement.ATTACH || s.type === SQLStatement.DETACH,
        );

        if (hasDDL || hasAttachDetach) {
          const attachedDatabasesResult = await conn.execute(
            'SELECT DISTINCT database_name FROM duckdb_databases',
          );

          // Handle the result format from conn.execute (returns {rows: [...], columns: [...], ...})
          let attachedDatabases: any[];
          if (attachedDatabasesResult && attachedDatabasesResult.rows) {
            // Direct result format from Tauri connection
            attachedDatabases = attachedDatabasesResult.rows;
          } else if (Array.isArray(attachedDatabasesResult)) {
            // Already an array
            attachedDatabases = attachedDatabasesResult;
          } else {
            // Fallback
            attachedDatabases = [];
          }

          // Filter out system databases manually since attached databases might be marked as internal
          const systemDatabases = ['system', 'temp'];
          const dbNames = attachedDatabases
            .map((row: any) => row.database_name)
            .filter((name) => !systemDatabases.includes(name));

          // For newly attached databases, we need to ensure metadata is loaded
          // by querying the database schema
          for (const dbName of dbNames) {
            if (dbName !== 'memory' && dbName !== 'temp' && dbName !== 'system') {
              try {
                // Try to query the database to ensure metadata is loaded
                const { toDuckDBIdentifier } = await import('@utils/duckdb/identifier');
                const schemaQuery = `SELECT table_name FROM ${toDuckDBIdentifier(
                  dbName,
                )}.information_schema.tables LIMIT 1`;
                await pool.query(schemaQuery).catch(() => {
                  // If information_schema doesn't exist, try duckdb_tables
                  return pool
                    .query(
                      `SELECT name FROM ${toDuckDBIdentifier(
                        dbName,
                      )}.sqlite_master WHERE type='table' LIMIT 1`,
                    )
                    .catch(() => {
                      // Ignore errors - some databases might not have these views
                    });
                });
              } catch (e) {
                // Ignore errors
              }
            }
          }

          // Refresh metadata for all attached databases
          const newMetadata = await getDatabaseModel(pool, dbNames);

          // Update metadata in store
          const { databaseMetadata, dataSources } = useAppStore.getState();
          const updatedMetadata = new Map(databaseMetadata);
          const updatedDataSources = new Map(dataSources);

          // Update or remove database metadata based on results
          for (const [dbName, dbModel] of newMetadata) {
            updatedMetadata.set(dbName, dbModel);
          }

          // Handle newly attached remote databases and detached databases
          if (hasAttachDetach) {
            // Check for remote databases that were attached or detached
            for (const statement of classifiedStatements) {
              if (statement.type === SQLStatement.ATTACH) {
                // Parse ATTACH statement to extract URL and database name (safely)
                const { parseAttachStatement } = await import('@utils/sql-attach');
                const attachInfo = parseAttachStatement(statement.code);

                if (attachInfo) {
                  const { url, dbName } = attachInfo;
                  const { isMotherDuckUrl } = await import('@utils/url-helpers');

                  // Check if this database is already registered
                  const existingDb = Array.from(dataSources.values()).find(
                    (ds) =>
                      (ds.type === 'remote-db' && ds.dbName === dbName) ||
                      (ds.type === 'attached-db' && ds.dbName === dbName),
                  );

                  if (!existingDb) {
                    // Create RemoteDB entry
                    const remoteDb: RemoteDB = {
                      type: 'remote-db',
                      id: makePersistentDataSourceId(),
                      legacyUrl: url,
                      connectionType: url.startsWith('md:') ? 'motherduck' : 'url',
                      dbName,
                      queryEngineType: 'duckdb',
                      supportedPlatforms: ['duckdb-wasm', 'duckdb-tauri'],
                      connectionState: 'connected',
                      attachedAt: Date.now(),
                      // For MotherDuck databases attached via SQL, we don't have the secret name
                      // so we use 'default' to group them together
                      instanceName: isMotherDuckUrl(url) ? 'default' : undefined,
                    };

                    updatedDataSources.set(remoteDb.id, remoteDb);

                    // Persist (SQLite in Tauri or IndexedDB on web)
                    const { _iDbConn, _persistenceAdapter } = useAppStore.getState();
                    const store = (_persistenceAdapter as any) || _iDbConn;
                    if (store) {
                      await persistPutDataSources(store, [remoteDb]);
                    }
                  }
                }
              } else if (statement.type === SQLStatement.DETACH) {
                // Parse DETACH statement to extract database name
                const detachMatch = statement.code.match(/DETACH\s+(?:DATABASE\s+)?("[^"]+"|\w+)/i);
                if (detachMatch) {
                  let [, dbName] = detachMatch as any;
                  if (dbName.startsWith('"') && dbName.endsWith('"')) {
                    dbName = dbName.slice(1, -1).replace(/""/g, '"');
                  }

                  // Find and remove the database from dataSources
                  const dbToRemove = Array.from(updatedDataSources.entries()).find(
                    ([, ds]) =>
                      (ds.type === 'remote-db' && ds.dbName === dbName) ||
                      (ds.type === 'attached-db' && ds.dbName === dbName),
                  );

                  if (dbToRemove) {
                    const [dbId] = dbToRemove;
                    updatedDataSources.delete(dbId);

                    // Remove from metadata
                    updatedMetadata.delete(dbName);

                    // Remove from persistent store
                    const { _iDbConn, _persistenceAdapter } = useAppStore.getState();
                    const store = (_persistenceAdapter as any) || _iDbConn;
                    if (store) {
                      await persistDeleteDataSource(store, [dbId], []);
                    }
                  }
                }
              }
            }
          }

          useAppStore.setState(
            {
              databaseMetadata: updatedMetadata,
              dataSources: updatedDataSources,
            },
            undefined,
            'AppStore/runScript/refreshMetadata',
          );
        }
      } finally {
        // Release the pooled connection
        await pool.release(conn);
      }

      // Only set success state if there are no immediate errors
      // Streaming errors will be caught by the useEffect hook
      setScriptExecutionState('success');
      clearTabExecutionError(tabId);
      incrementScriptVersion();

      // As of today, even if the same statement is executed, we will
      // update the state and trigger re-render.
      updateScriptTabLastExecutedQuery({ tabId, lastExecutedQuery, force: true });
    },
    [pool, protectedViews, tabId, incrementScriptVersion, preferences, tab.sqlScriptId],
  );

  const setPanelSize = ([editor, table]: number[]) => {
    updateScriptTabLayout(tab.id, [editor, table]);
  };

  return (
    <div className="h-full relative">
      <Allotment
        vertical
        onDragEnd={setPanelSize}
        defaultSizes={[tab.editorPaneHeight, tab.dataViewPaneHeight]}
      >
        <Allotment.Pane preferredSize={tab.editorPaneHeight} minSize={200}>
          <ScriptEditor
            id={tab.sqlScriptId}
            active={active}
            runScriptQuery={runScriptQuery}
            scriptState={scriptExecutionState}
          />
        </Allotment.Pane>

        <Allotment.Pane preferredSize={tab.dataViewPaneHeight} minSize={120}>
          <DataViewInfoPane dataAdapter={dataAdapter} tabType={tab.type} tabId={tab.id} />
          <DataView active={active} dataAdapter={dataAdapter} tabId={tab.id} tabType={tab.type} />
        </Allotment.Pane>
      </Allotment>
    </div>
  );
});
