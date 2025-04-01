import { createContext, useContext, useState } from 'react';
import { useAppStore } from '@store/app-store';
import { tableFromIPC } from 'apache-arrow';
import { useAppNotifications } from '@components/app-notifications';
import { useAbortController } from '@hooks/useAbortController';
import { notifications } from '@mantine/notifications';
import { Button, Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { AddDataSourceProps } from '@models/common';
import {
  useAllTabsQuery,
  useCreateTabMutation,
  useFileHandlesQuery,
  useQueryFilesQuery,
  useSetActiveTabMutation,
} from '@store/app-idb-store';
import {
  DBRunQueryProps,
  DBWorkerAPIType,
  DropFilesAndDBInstancesProps,
  RunQueryResponse,
} from './models';
import { executeQueries, updateDatabasesWithColumns } from './utils';
import { ErrorModal } from './components/error-modal';
import { useDataSourcesActions } from './hooks/useDataSourcesActions';
import { useAppInitialization } from './hooks/useInitApplication';
import { Remote } from 'comlink';

interface AppContextType {
  runQuery: (
    runQueryProps: DBRunQueryProps,
  ) => Promise<(RunQueryResponse & { originalQuery: string }) | undefined>;
  openTab: (sourceId: string, type: 'query' | 'file') => Promise<void>;
  onCancelQuery: (v?: string) => Promise<void>;
  executeQuery: (query: string) => Promise<any>;
  dbProxyRef: React.RefObject<Remote<DBWorkerAPIType> | null>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const { showError } = useAppNotifications();
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
  const runQuery: AppContextType['runQuery'] = async (runQueryProps) => {
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
      const { queryResults, originalQuery } = await executeQueries({
        runQueryProps: queryProps,
        dbProxyRef,
        isCancelledPromise,
        currentSources: dataSources,
      });

      // Post-process the final query result
      if (queryResults) {
        const duckdbDatabases = await dbProxyRef.current.getDBUserInstances('databases');

        const dbsNames = tableFromIPC(duckdbDatabases)
          .toArray()
          .map((row) => row.toJSON().database_name);

        const transformedTables = await updateDatabasesWithColumns(dbProxyRef.current, dbsNames);

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

  const openTab = async (sourceId: string, type: 'query' | 'file') => {
    if (activeTab?.sourceId === sourceId) return;
    console.log({
      sourceId,
      queryFiles,
    });

    const tab = tabs?.find((t) => t.sourceId === sourceId);
    const queryFile = queryFiles.find((query) => query.id === sourceId);
    const view = views.find((v) => v.sourceId === sourceId);

    if (type === 'query' && !queryFile) {
      console.log('asda');

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
  };

  const onCancelQuery = async (reason?: string) => {
    abortSignal(reason);
  };

  const value: AppContextType = {
    runQuery,
    onCancelQuery,
    executeQuery,
    openTab,
    dbProxyRef,
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
    throw new Error('useAppContext must be used within a AppContextProvider');
  }
  return context;
};
