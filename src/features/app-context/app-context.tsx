import { createContext, useContext, useCallback } from 'react';
import { useAppStore } from '@store/app-store';
import { tableFromIPC } from 'apache-arrow';
import { useAppNotifications } from '@components/app-notifications';
import { useAbortController } from '@hooks/useAbortController';
import { notifications } from '@mantine/notifications';
import { Button, Group, Stack, Text } from '@mantine/core';
import {
  useAllTabsQuery,
  useCreateTabMutation,
  useFileHandlesQuery,
  useQueryFilesQuery,
  useSetActiveTabMutation,
} from '@store/app-idb-store';
import { useDuckDBConnection } from '@features/duckdb-context/duckdb-context';
import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { openQueryErrorModal } from '@features/error-modal/query-error-modal';
import { DBRunQueryProps, RunQueryResponse } from './models';
import { executeQueries, updateDatabasesWithColumns } from './utils';
import { useAppInitialization } from './hooks/useInitApplication';
import { dbApiProxi } from './db-worker';
import { DevModal } from './components/dev-modal';

interface AppContextType {
  runQuery: (
    runQueryProps: DBRunQueryProps,
  ) => Promise<(RunQueryResponse & { originalQuery: string }) | undefined>;
  openTab: (sourceId: string, type: 'query' | 'file') => Promise<void>;
  onCancelQuery: (v?: string) => Promise<void>;
  executeQuery: (query: string) => Promise<any>;
  conn: AsyncDuckDBConnection | null;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const { showError } = useAppNotifications();
  const { abortSignal, getSignal } = useAbortController();
  const { conn } = useDuckDBConnection();

  useAppInitialization();

  /**
   * Local state
   */

  /**
   * Query state
   */
  const { data: dataSources = [] } = useFileHandlesQuery();
  const { mutateAsync: mutateTab } = useCreateTabMutation();
  const { data: tabs } = useAllTabsQuery();
  const activeTab = tabs?.find((tab) => tab.active);

  const { mutateAsync: switchTab } = useSetActiveTabMutation();
  const { data: queryFiles = [] } = useQueryFilesQuery();

  /**
   * Store access
   */
  const setDatabases = useAppStore((state) => state.setDatabases);
  const views = useAppStore((state) => state.views);

  const executeQuery = useCallback(
    async (query: string) => {
      if (!conn) {
        throw new Error('Connection is not established');
      }

      const result = await dbApiProxi.runQuery({ conn, query });
      return tableFromIPC(result.data);
    },
    [conn],
  );

  /**
   * Executes a database query and updates the UI with the results. Handles cancelation,
   * cleans up unused resources, and processes the results for the last executed query.
   */
  const runQuery = useCallback(
    async (runQueryProps: DBRunQueryProps) => {
      if (!conn) {
        throw new Error('Connection is not established');
      }

      try {
        // Create a cancelation signal to support cancelable queries
        const signal = getSignal();
        const isCancelledPromise = new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });

        // TODO: Implement pagination using tab data
        const queryProps = !runQueryProps.isPagination
          ? { ...runQueryProps }
          : // ? { ...runQueryProps, limit, offset: (currentPage - 1) * limit }
            runQueryProps;

        // Use executeQueries utility function to parse and execute the query
        const { queryResults, originalQuery } = await executeQueries({
          runQueryProps: queryProps,
          conn,
          isCancelledPromise,
          currentSources: dataSources,
        });

        // Post-process the final query result
        if (queryResults) {
          const duckdbDatabases = await dbApiProxi.getDBUserInstances(conn, 'databases');

          const dbsNames = tableFromIPC(duckdbDatabases)
            .toArray()
            .map((row) => row.toJSON().database_name);

          const transformedTables = await updateDatabasesWithColumns(conn, dbsNames);

          // Update the application state with processed data
          setDatabases(transformedTables);
          return {
            data: queryResults.data,
            pagination: queryResults.pagination,
            originalQuery,
          };
        }

        return queryResults;
      } catch (e: any) {
        if (e.name === 'AbortError') {
          console.warn('Query execution was cancelled by the user.');
          return;
        }

        console.error('Failed to run query: ', e);
        const errorMessageTooLong = e.message.length > 500;

        const onOpenMoreModal = () => {
          openQueryErrorModal(e.message);
          notifications.clean();
        };
        showError({
          title: 'Failed to run query',
          message: (
            <Stack>
              <Text c="text-tertiary">{e?.message.slice(0, 100)}</Text>
              {errorMessageTooLong && (
                <Group justify="end">
                  <Button onClick={onOpenMoreModal} variant="transparent" c="text-tertiary">
                    Read more
                  </Button>
                </Group>
              )}
            </Stack>
          ),
          autoClose: 6000,
        });
      }
    },
    [conn, dataSources, getSignal, setDatabases, showError],
  );

  const openTab = useCallback(
    async (sourceId: string, type: 'query' | 'file') => {
      if (activeTab?.sourceId === sourceId) return;

      const tab = tabs?.find((t) => t.sourceId === sourceId);
      const queryFile = queryFiles.find((query) => query.id === sourceId);
      const view = views.find((v) => v.sourceId === sourceId);

      if (type === 'query' && !queryFile) {
        throw new Error(`Query file with id ${sourceId} not found`);
      }
      if (type === 'file' && !view) {
        throw new Error(`Tab with id ${sourceId} not found`);
      }

      if (tab) {
        await switchTab(tab.id);
      } else {
        // Create a new tab and set it as active
        await mutateTab({
          sourceId,
          name: (type === 'query' ? queryFile?.name : view?.view_name) || '',
          type,
          state: 'pending',
          active: true,
          stable: true,
        });
      }
    },
    [activeTab, mutateTab, queryFiles, switchTab, tabs, views],
  );

  const onCancelQuery = useCallback(
    async (reason?: string) => {
      abortSignal(reason);
    },
    [abortSignal],
  );

  const value: AppContextType = {
    runQuery,
    onCancelQuery,
    executeQuery,
    openTab,
    conn,
  };

  return (
    <AppContext.Provider value={value}>
      {import.meta.env.DEV && <DevModal />}
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within a AppContextProvider');
  }
  return context;
};
