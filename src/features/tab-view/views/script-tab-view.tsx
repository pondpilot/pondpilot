import { showError, showErrorWithAction, showSuccess } from '@components/app-notifications';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { syncFiles } from '@controllers/file-system';
import { updateSQLScriptContent } from '@controllers/sql-script';
import {
  updateScriptTabLastExecutedQuery,
  updateScriptTabLayout,
  clearTabExecutionError,
  setTabExecutionError,
  updateTabViewMode,
  updateTabChartConfig,
} from '@controllers/tab';
import { useChartData, useSmallMultiplesData } from '@features/chart-view';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { AsyncDuckDBPooledPreparedStatement } from '@features/duckdb-context/duckdb-pooled-prepared-stmt';
import { ScriptEditor } from '@features/script-editor';
import { useEditorPreferences } from '@hooks/use-editor-preferences';
import { ChartConfig, DEFAULT_CHART_CONFIG, DEFAULT_VIEW_MODE, ViewMode } from '@models/chart';
import { ScriptExecutionState } from '@models/sql-script';
import { ScriptTab, TabId } from '@models/tab';
import { useAppStore, useProtectedViews, useTabReactiveState } from '@store/app-store';
import {
  handleAttachStatements,
  handleCreateSecretStatements,
  handleDetachStatements,
} from '@utils/attach-detach-handler';
import {
  splitSQLByStats,
  classifySQLStatements,
  validateStatements,
  SelectableStatements,
  SQLStatement,
  SQLStatementType,
  ClassifiedSQLStatement,
} from '@utils/editor/sql';
import { isNotReadableError, getErrorMessage } from '@utils/error-classification';
import { pooledConnectionQueryWithCorsRetry } from '@utils/query-with-cors-retry';
import { formatSQLSafe } from '@utils/sql-formatter';
import { Allotment } from 'allotment';
import { memo, useCallback, useRef, useState } from 'react';

import { DataView, DataViewInfoPane } from '../components';
import { useDataAdapter } from '../hooks/use-data-adapter';

interface ScriptTabViewProps {
  tabId: TabId;
  active: boolean;
}

const SECRET_STATEMENT_PATTERN = /\b(ALTER|CREATE)\s+(?:OR\s+REPLACE\s+)?SECRET\b/i;

const redactSensitiveLastQuery = (
  statement: ClassifiedSQLStatement,
  fallback: string | null,
): string | null => {
  if (
    (statement.type === SQLStatement.CREATE || statement.type === SQLStatement.ALTER) &&
    SECRET_STATEMENT_PATTERN.test(statement.code)
  ) {
    return null;
  }

  return fallback;
};

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

  // View mode state (table/chart)
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => useAppStore.getState().tabs.get(tabId)?.dataViewStateCache?.viewMode ?? DEFAULT_VIEW_MODE,
  );

  // Chart configuration state
  const [chartConfig, setChartConfig] = useState<ChartConfig>(() => {
    const cached = useAppStore.getState().tabs.get(tabId)?.dataViewStateCache?.chartConfig;
    return cached ?? DEFAULT_CHART_CONFIG;
  });

  const isSmallMultiplesMode = chartConfig.additionalYColumns.length > 0;
  const shouldFetchChartData = viewMode === 'chart' && !isSmallMultiplesMode;
  const chartDataResult = useChartData(dataAdapter, chartConfig, {
    enabled: shouldFetchChartData,
  });
  const smallMultiplesResult = useSmallMultiplesData(dataAdapter, chartConfig);

  // Ref for chart container (used for PNG export)
  const chartRef = useRef<HTMLDivElement>(null);

  // Handle view mode change
  const handleViewModeChange = useCallback(
    (newMode: ViewMode) => {
      setViewMode(newMode);
      updateTabViewMode(tabId, newMode);
    },
    [tabId],
  );

  // Handle chart config change
  const handleChartConfigChange = useCallback(
    (newConfig: Partial<ChartConfig>) => {
      setChartConfig((prev) => {
        const updated = { ...prev, ...newConfig };
        // Schedule store update after state is set to avoid side effects in updater
        queueMicrotask(() => updateTabChartConfig(tabId, updated));
        return updated;
      });
    },
    [tabId],
  );

  // Neither of the following checks should be necessary as this is called
  // from the tab view which gets the ids from the same map in the store
  // and dispatches on the tab type. But we are being very robust here.

  const [scriptExecutionState, setScriptExecutionState] = useState<ScriptExecutionState>('idle');

  const pool = useInitializedDuckDBConnectionPool();
  const protectedViews = useProtectedViews();
  const { preferences } = useEditorPreferences();

  const formatStatementError = useCallback(
    (
      statement: { type: SQLStatement; lineNumber: number; statementIndex: number; code: string },
      errorMessage: string,
    ) => {
      const truncatedCode =
        statement.code.length > 100 ? `${statement.code.substring(0, 100)}...` : statement.code;
      const statementNum = statement.statementIndex + 1;
      return `Line ${statement.lineNumber}, statement ${statementNum} (${statement.type}):\n${truncatedCode}\n\n${errorMessage}`;
    },
    [],
  );

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
      const statements = await splitSQLByStats(queryToExecute);

      // Classify statements
      const classifiedStatements = classifySQLStatements(statements);

      // Check if the statements are valid
      const errors = validateStatements(classifiedStatements, protectedViews);
      if (errors.length > 0) {
        console.error('Errors in SQL statements:', errors);
        setScriptExecutionState('error');
        showError({
          title: 'Error in SQL statements',
          message: errors.join('\n'),
        });
        return;
      }

      // Query to be used in data adapter and saved to the store
      let lastExecutedQuery: string | null = null;

      // Create a pooled connection
      const conn = await pool.getPooledConnection();

      const runQueryWithFileSyncAndRetry = async (code: string) => {
        try {
          await pooledConnectionQueryWithCorsRetry(conn, code);
        } catch (error: unknown) {
          if (isNotReadableError(error)) {
            await syncFiles(pool);
            await pooledConnectionQueryWithCorsRetry(conn, code);
          } else {
            throw error;
          }
        }
      };

      const prepQueryWithFileSyncAndRetry = async (
        code: string,
      ): Promise<AsyncDuckDBPooledPreparedStatement<any>> => {
        try {
          return await conn.prepare(code);
        } catch (error: unknown) {
          if (isNotReadableError(error)) {
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
          await conn.query('BEGIN TRANSACTION');
        }

        // Execute each statement except the last one
        const statsExceptLast = classifiedStatements.slice(0, -1);
        for (const statement of statsExceptLast) {
          try {
            await runQueryWithFileSyncAndRetry(statement.code);
          } catch (error) {
            const message = getErrorMessage(error);
            if (needsTransaction) {
              await conn.query('ROLLBACK');
            }
            console.error('Error executing statement:', statement.type, error);
            setScriptExecutionState('error');
            setTabExecutionError(tabId, {
              errorMessage: message,
              statementType: statement.type,
              timestamp: Date.now(),
              lineNumber: statement.lineNumber,
              statementIndex: statement.statementIndex,
              statementCode: statement.code.substring(0, 200),
            });
            showErrorWithAction({
              title: 'Error executing SQL statement',
              message: formatStatementError(statement, message),
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
            const message = getErrorMessage(error);

            if (needsTransaction) {
              await conn.query('ROLLBACK');
            }
            console.error(
              'Creation of a prepared statement for the last SELECT statement failed:',
              error,
            );
            setScriptExecutionState('error');
            setTabExecutionError(tabId, {
              errorMessage: message,
              statementType: lastStatement.type,
              timestamp: Date.now(),
              lineNumber: lastStatement.lineNumber,
              statementIndex: lastStatement.statementIndex,
              statementCode: lastStatement.code.substring(0, 200),
            });
            showErrorWithAction({
              title: 'Error executing SQL statement',
              message: formatStatementError(lastStatement, message),
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
          lastExecutedQuery = redactSensitiveLastQuery(lastStatement, lastStatement.code);
        } else {
          // The last statement is not a SELECT statement
          // Execute it immediately
          try {
            await runQueryWithFileSyncAndRetry(lastStatement.code);
          } catch (error) {
            const message = getErrorMessage(error);
            if (needsTransaction) {
              await conn.query('ROLLBACK');
            }
            console.error('Error executing last non-SELECT statement:', lastStatement.type, error);
            setScriptExecutionState('error');
            setTabExecutionError(tabId, {
              errorMessage: message,
              statementType: lastStatement.type,
              timestamp: Date.now(),
              lineNumber: lastStatement.lineNumber,
              statementIndex: lastStatement.statementIndex,
              statementCode: lastStatement.code.substring(0, 200),
            });
            showErrorWithAction({
              title: 'Error executing SQL statement',
              message: formatStatementError(lastStatement, message),
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
          lastExecutedQuery = redactSensitiveLastQuery(
            lastStatement,
            "SELECT 'All statements executed successfully' as Result",
          );
        }

        // All statements executed successfully
        if (needsTransaction) {
          await conn.query('COMMIT');
        }

        // Check if any DDL or database operations were executed and refresh metadata
        const hasDDL = classifiedStatements.some((s) => s.sqlType === SQLStatementType.DDL);
        const hasAttachDetach = classifiedStatements.some(
          (s) => s.type === SQLStatement.ATTACH || s.type === SQLStatement.DETACH,
        );

        if (hasDDL || hasAttachDetach) {
          // Get all currently attached databases
          const attachedDatabasesResult = await conn.query(
            'SELECT DISTINCT database_name FROM duckdb_databases() WHERE NOT internal',
          );
          const attachedDatabases = attachedDatabasesResult.toArray();
          const dbNames = attachedDatabases.map((row: any) => row.database_name);

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

          // Handle newly attached remote databases / Iceberg catalogs and detached databases
          if (hasAttachDetach) {
            // Process CREATE SECRET statements first so ATTACH can reference them
            const secretMapping = await handleCreateSecretStatements(classifiedStatements);
            const handlerContext = { dataSources, updatedDataSources, updatedMetadata };
            await handleAttachStatements(classifiedStatements, handlerContext, secretMapping);
            await handleDetachStatements(classifiedStatements, handlerContext);
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
        await conn.close();
      }

      setScriptExecutionState('success');
      clearTabExecutionError(tabId);
      incrementScriptVersion();

      // As of today, even if the same statement is executed, we will
      // update the state and trigger re-render.
      updateScriptTabLastExecutedQuery({ tabId, lastExecutedQuery, force: true });
    },
    [
      pool,
      protectedViews,
      tabId,
      incrementScriptVersion,
      preferences,
      tab.sqlScriptId,
      formatStatementError,
    ],
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
          <DataViewInfoPane
            dataAdapter={dataAdapter}
            tabType={tab.type}
            tabId={tab.id}
            viewMode={viewMode}
            chartConfig={chartConfig}
            onViewModeChange={handleViewModeChange}
            onChartConfigChange={handleChartConfigChange}
            chartRef={chartRef}
            xAxisCandidates={chartDataResult.xAxisCandidates}
            yAxisCandidates={chartDataResult.yAxisCandidates}
            groupByCandidates={chartDataResult.groupByCandidates}
            chartData={chartDataResult.chartData}
            pieChartData={chartDataResult.pieChartData}
            multiplesData={smallMultiplesResult.multiplesData}
          />
          <DataView
            active={active}
            dataAdapter={dataAdapter}
            tabId={tab.id}
            tabType={tab.type}
            viewMode={viewMode}
            chartConfig={chartConfig}
            onChartConfigChange={handleChartConfigChange}
            onViewModeChange={handleViewModeChange}
            chartRef={chartRef}
            chartDataResult={chartDataResult}
            smallMultiplesResult={smallMultiplesResult}
          />
        </Allotment.Pane>
      </Allotment>
    </div>
  );
});
