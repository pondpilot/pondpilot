import { createContext, useContext, useCallback } from 'react';
import { tableFromIPC } from 'apache-arrow';
import { useAppNotifications } from '@components/app-notifications';
import { useAbortController } from '@hooks/useAbortController';
import { notifications } from '@mantine/notifications';
import { Button, Group, Stack, Text } from '@mantine/core';
import { useDuckDBConnection } from '@features/duckdb-context/duckdb-context';
import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { openQueryErrorModal } from '@features/error-modal/query-error-modal';
import { useProtectedViews } from '@store/app-store';
import { executeQueries } from './utils';
import { useAppInitialization } from './hooks/useInitApplication';
import { DBRunQueryProps, runQueryDeprecated, RunQueryResponse } from './db-worker';
import { DevModal } from './components/dev-modal';

interface AppContextType {
  runQuery: (
    runQueryProps: DBRunQueryProps,
  ) => Promise<(RunQueryResponse & { originalQuery: string }) | undefined>;
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
   * Store access
   */
  const protectedViews = useProtectedViews();

  const executeQuery = useCallback(
    async (query: string) => {
      if (!conn) {
        throw new Error('Connection is not established');
      }

      const result = await runQueryDeprecated({ conn, query });
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
          protectedViews,
        });

        // Post-process the final query result
        if (queryResults) {
          // Update the application state with processed data
          // When refactoring this - remember to check for DML and
          // cleverly update parts of the dataBaseMetadata state

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
    [conn, protectedViews, getSignal, showError],
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
