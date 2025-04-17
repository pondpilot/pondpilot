import { memo, useCallback, useState } from 'react';
import { Allotment } from 'allotment';
import { ScriptTab } from '@models/tab';
import { ScriptEditor } from '@features/script-editor';
import { DataView } from '@features/tab-view/components/data-view';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { useAppStore, useProtectedViews } from '@store/app-store';
import { DataAdapterApi } from '@models/data-adapter';
import { getArrowTableSchema } from '@utils/arrow/schema';
import {
  trimQuery,
  splitSQLByStats,
  classifySQLStatements,
  validateStatements,
  SQLStatement,
} from '@utils/editor/sql';
import { updateScriptTabEditorPaneHeight, updateTabDataViewLayout } from '@controllers/tab';
import { Center, Stack, Text } from '@mantine/core';
import { IconClipboardSmile } from '@tabler/icons-react';
import { ScriptExecutionState } from '@models/sql-script';
import { showError } from '@components/app-notifications';
import { CachedDataView } from './cached-data-view';
import { DataViewInfoPane } from './data-view-info-pane';

interface ScriptTabViewProps {
  tab: ScriptTab;
  active: boolean;
}

export const ScriptTabView = memo(({ tab, active }: ScriptTabViewProps) => {
  const [dataAdapter, setDataAdapter] = useState<DataAdapterApi | null>(null);
  const [scriptExecutionState, setScriptExecutionState] = useState<ScriptExecutionState>('idle');

  const pool = useInitializedDuckDBConnectionPool();
  const protectedViews = useProtectedViews();

  // NON-REACTIVE acccess, as this is only used once to show the cached data
  // after application start and before the first query is executed
  const cachedData = useAppStore.getState().dataViewCache.get(tab.id);
  const showCachedDataView = !dataAdapter && cachedData;
  const showRunQueryCTA = (!dataAdapter && !cachedData) || scriptExecutionState === 'idle';

  const runScriptQuery = useCallback(
    async (query: string) => {
      setScriptExecutionState('running');
      // Parse query into statements
      const statements = splitSQLByStats(query);

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

      // Query to be used in data adapter
      let dataAdapterQuery: string | null = null;

      // Create a pooled connection
      const conn = await pool.getPooledConnection();

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
            await conn.query(statement.code);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (needsTransaction) {
              await conn.query('ROLLBACK');
            }
            console.error('Error executing statement:', statement.type, error);
            setScriptExecutionState('error');
            showError({
              title: 'Error executing SQL statement',
              message: `Error in ${statement.type} statement: ${message}`,
            });
            return;
          }
        }

        const lastStatement = classifiedStatements[classifiedStatements.length - 1];
        if (lastStatement.type === SQLStatement.SELECT) {
          // Validate last SELECT statement via prepare
          try {
            const preparedStatement = await conn.prepare(lastStatement.code);
            await preparedStatement.close();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            if (needsTransaction) {
              await conn.query('ROLLBACK');
            }
            console.error(
              'Creation of a prepared statement for the last SELECT statement failed:',
              error,
            );
            setScriptExecutionState('error');
            showError({
              title: 'Error executing SQL statement',
              message: `Error in ${lastStatement.type} statement: ${message}`,
            });
            return;
          }
          dataAdapterQuery = lastStatement.code;
        } else {
          // The last statement is not a SELECT statement
          // Execute it immediately
          try {
            await conn.query(lastStatement.code);
          } catch (error) {
            if (needsTransaction) {
              await conn.query('ROLLBACK');
            }
            console.error('Error executing last non-SELECT statement:', lastStatement.type, error);
            setScriptExecutionState('error');
            showError({
              title: 'Error executing SQL statement',
              message: `Error in ${lastStatement.type} statement: ${error}`,
            });
            return;
          }
          dataAdapterQuery = "SELECT 'All statements executed successfully' as Result";
        }

        // All statements executed successfully
        if (needsTransaction) {
          await conn.query('COMMIT');
          // TODO: Update metadata
          console.log('TODO: Queue metadata update');
        }
      } finally {
        // Release the pooled connection
        await conn.close();
      }

      setScriptExecutionState('success');

      setDataAdapter({
        getSchema: async () => {
          // TODO: find more performant way to get schema
          const result = await pool.query(`SELECT * FROM (${trimQuery(dataAdapterQuery)}) LIMIT 0`);
          return getArrowTableSchema(result);
        },
        getReader: async (sort) => {
          let fullQuery = dataAdapterQuery;

          if (sort.length > 0) {
            const orderBy = sort.map((s) => `"${s.column}" ${s.order || 'asc'}`).join(', ');
            fullQuery = `
              SELECT * FROM (${trimQuery(dataAdapterQuery)}) ORDER BY ${orderBy}`;
          }
          const reader = await pool.send(fullQuery, true);
          return reader;
        },
      });
    },
    [pool, protectedViews],
  );

  const setPanelSize = ([editor, table]: number[]) => {
    updateTabDataViewLayout(tab, {
      ...tab.dataViewLayout,
      dataViewPaneHeight: table,
    });
    updateScriptTabEditorPaneHeight(tab, editor);
  };

  return (
    <div className="h-full relative">
      <Allotment
        vertical
        onDragEnd={setPanelSize}
        defaultSizes={[tab.editorPaneHeight, tab.dataViewLayout.dataViewPaneHeight]}
      >
        <Allotment.Pane preferredSize={tab.editorPaneHeight} minSize={200}>
          <ScriptEditor
            id={tab.sqlScriptId}
            active={active}
            runScriptQuery={runScriptQuery}
            scriptState={scriptExecutionState}
          />
        </Allotment.Pane>

        <Allotment.Pane preferredSize={tab.dataViewLayout.dataViewPaneHeight} minSize={120}>
          {showRunQueryCTA && (
            <Center className="h-full font-bold">
              <Stack align="center" c="icon-default" gap={4}>
                <IconClipboardSmile size={32} stroke={1} />
                <Text c="text-secondary">Your query results will be displayed here.</Text>
              </Stack>
            </Center>
          )}
          <>
            {dataAdapter ? (
              <>
                <DataViewInfoPane dataAdapterApi={dataAdapter} />
                <DataView visible={active} cacheKey={tab.id} dataAdapterApi={dataAdapter} />
              </>
            ) : showCachedDataView ? (
              <CachedDataView cachedData={cachedData} />
            ) : null}
          </>
        </Allotment.Pane>
      </Allotment>
    </div>
  );
});
