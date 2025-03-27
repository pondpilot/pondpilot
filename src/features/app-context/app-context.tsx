import { createContext, useContext, useState } from 'react';
import { useAppStore } from '@store/app-store';
import { tableFromIPC } from 'apache-arrow';
import { useAppNotifications } from '@components/app-notifications';
import { useAbortController } from '@hooks/useAbortController';
import { notifications } from '@mantine/notifications';
import { Button, Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { AddDataSourceProps } from '@models/common';
import { useDeleteFileHandlesMutation, useFileHandlesQuery } from '@store/app-idb-store';
import { DBRunQueryProps, DropFilesAndDBInstancesProps, RunQueryResponse } from './models';
import { executeQueries, updateDatabasesWithColumns } from './utils';
import { ErrorModal } from './components/error-modal';
import { useDataSourcesActions } from './hooks/useDataSourcesActions';
import { useAppInitialization } from './hooks/useInitApplication';

interface AppContextType {
  onAddDataSources: (entries: AddDataSourceProps) => Promise<any>;
  onDeleteDataSource: (v: DropFilesAndDBInstancesProps) => Promise<void>;
  runQuery: (runQueryProps: DBRunQueryProps) => Promise<RunQueryResponse | undefined>;
  onCancelQuery: (v?: string) => Promise<void>;
  executeQuery: (query: string) => Promise<any>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const { showError, showSuccess } = useAppNotifications();
  const { abortSignal, getSignal } = useAbortController();
  const { dbProxyRef } = useAppInitialization();

  /**
   * Local state
   */
  const [errorModalOpened, { open: openErrorModal, close: closeErrorModal }] = useDisclosure(false);
  const [errortext, setErrorModalText] = useState('');

  /**
   * Query state
   */
  const { data: dataSources = [] } = useFileHandlesQuery();

  /**
   * Mutations IDB
   */
  const { mutateAsync: deleteSources } = useDeleteFileHandlesMutation();

  /**
   * Store access
   */
  const setViews = useAppStore((state) => state.setViews);
  const setDatabases = useAppStore((state) => state.setDatabases);

  /**
   * Actions
   */
  const { onAddDataSources, onDeleteDataSource } = useDataSourcesActions(dbProxyRef);

  const handleClosingErrorModal = () => {
    setErrorModalText('');
    closeErrorModal();
  };

  const executeQuery = async (query: string) => {
    if (!dbProxyRef.current) return;

    const result = await dbProxyRef.current.runQuery({ query });

    return tableFromIPC(result.data);
  };

  /**
   * Executes a database query and updates the UI with the results. Handles cancelation,
   * cleans up unused resources, and processes the results for the last executed query.
   */
  const runQuery = async (
    runQueryProps: DBRunQueryProps,
  ): Promise<RunQueryResponse | undefined> => {
    try {
      // Ensure necessary proxies are initialized
      if (!dbProxyRef.current) throw new Error('Proxy not initialized');

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
      const { queryResults } = await executeQueries({
        runQueryProps: queryProps,
        dbProxyRef,
        isCancelledPromise,
        currentSources: dataSources,
      });

      // Post-process the final query result
      if (queryResults) {
        // Get updated views and databases from the database proxy
        const updatedViews = await dbProxyRef.current.getDBUserInstances('views');
        const duckdbDatabases = await dbProxyRef.current.getDBUserInstances('databases');

        // Process views and databases into lists using Apache Arrow
        const viewsNames = tableFromIPC(updatedViews)
          .toArray()
          .map((row) => row.toJSON().view_name);
        const dbsNames = tableFromIPC(duckdbDatabases)
          .toArray()
          .map((row) => row.toJSON().database_name);

        // Identify unused resources and clean them up
        const filesToDelete = dataSources.filter(
          (source) =>
            source.kind === 'DATASET' &&
            !viewsNames.includes(source.name) &&
            !dbsNames.includes(source.name),
        );

        if (filesToDelete?.length) {
          await deleteSources(filesToDelete.map((file) => file.id));
          showSuccess({ title: 'Success', message: 'View deleted' });
        }

        // Filter out unused views and update the state
        const filteredViews = viewsNames.filter((view) =>
          dataSources?.some((source) => source.name === view),
        );

        const transformedTables = await updateDatabasesWithColumns(dbProxyRef.current, dbsNames);

        // Update the application state with processed data
        setDatabases(transformedTables);
        setViews(filteredViews);
        return {
          data: queryResults.data,
          pagination: queryResults.pagination,
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
      if (errorMessageTooLong) {
        setErrorModalText(e.message);
      }

      const onOpenMoreModal = () => {
        openErrorModal();
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
    } finally {
      // Ensure state is reset regardless of success or failure
    }
  };

  const onCancelQuery = async (reason?: string) => {
    abortSignal(reason);
  };

  const value: AppContextType = {
    onAddDataSources,
    onDeleteDataSource,
    runQuery,
    onCancelQuery,
    executeQuery,
  };

  return (
    <AppContext.Provider value={value}>
      <ErrorModal
        opened={errorModalOpened}
        onClose={handleClosingErrorModal}
        errorText={errortext}
      />
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }
  return context;
};
