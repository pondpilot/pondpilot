import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { releaseProxy, Remote, wrap } from 'comlink';
import { useAppStore } from '@store/app-store';
import { tableFromIPC } from 'apache-arrow';
import { useAppNotifications } from '@components/app-notifications';
import { useAbortController } from '@hooks/useAbortController';
import { notifications } from '@mantine/notifications';
import { Button, Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { AddDataSourceProps, DuckDBDatabase, DuckDBView } from '@models/common';
import {
  fileHandleStoreApi,
  useAddFileHandlesMutation,
  useCreateMultipleQueryFilesMutation,
  useDeleteFileHandlesMutation,
  useFileHandlesQuery,
  useDeleteTabsMutatuion,
  useAllTabsQuery,
} from '@store/app-idb-store';
import {
  DBRunQueryProps,
  DBWorkerAPIType,
  DropFilesAndDBInstancesProps,
  RunQueryResponse,
} from './models';
import { useShowPermsAlert } from './hooks';
import { executeQueries, updateDatabasesWithColumns } from './utils';
import { ErrorModal } from './components/error-modal';

interface AppContextType {
  onAddDataSources: (entries: AddDataSourceProps) => Promise<any>;
  onDeleteDataSource: (v: DropFilesAndDBInstancesProps) => Promise<void>;
  runQuery: (runQueryProps: DBRunQueryProps) => Promise<RunQueryResponse | undefined>;
  onCancelQuery: (v?: string) => Promise<void>;
  importSQLFiles: () => Promise<void>;
  executeQuery: (query: string) => Promise<any>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const { showError, showSuccess, showWarning } = useAppNotifications();
  const { abortSignal, getSignal } = useAbortController();
  const { showPermsAlert } = useShowPermsAlert();
  const dbWorkerRef = useRef<Worker | null>(null);
  const dbProxyRef = useRef<Remote<DBWorkerAPIType> | null>(null);

  /**
   * Local state
   */
  const [errorModalOpened, { open: openErrorModal, close: closeErrorModal }] = useDisclosure(false);
  const [errortext, setErrorModalText] = useState('');

  /**
   * Query state
   */
  const { mutateAsync: createMultipleQueryFiles } = useCreateMultipleQueryFilesMutation();
  const { mutateAsync: deleteSources } = useDeleteFileHandlesMutation();
  const { mutateAsync: deleteTabs } = useDeleteTabsMutatuion();

  const { mutateAsync: addSource } = useAddFileHandlesMutation();
  const { data: dataSources = [] } = useFileHandlesQuery();
  const { data: tabs = [] } = useAllTabsQuery();

  /**
   * Store access
   */
  const setViews = useAppStore((state) => state.setViews);
  const setAppStatus = useAppStore((state) => state.setAppStatus);
  const setDatabases = useAppStore((state) => state.setDatabases);

  const handleClosingErrorModal = () => {
    setErrorModalText('');
    closeErrorModal();
  };

  /**
   * Delete data source from the session
   */
  const onDeleteDataSource: AppContextType['onDeleteDataSource'] = async ({ ids, type }) => {
    if (!dbProxyRef.current) return;

    try {
      if (!dataSources.length) {
        throw new Error('Failed to get sources data');
      }

      const tabsToDelete = tabs.filter((tab) => ids.includes(tab.sourceId));
      if (tabsToDelete.length) {
        await deleteTabs(tabsToDelete.map((tab) => tab.id));
      }
      await dbProxyRef.current.dropFilesAndDBInstances({
        ids,
        type,
      });
      await deleteSources(ids);

      /**
       * Get views and databases from the database
       */
      const dbExternalViews: DuckDBView[] = tableFromIPC(
        await dbProxyRef.current.getDBUserInstances('views').catch((e) => {
          showError({ title: 'Failed to get views', message: e.message });
          return [];
        }),
      )
        .toArray()
        .map((row) => row.toJSON());

      const duckdbDatabases: string[] = tableFromIPC(
        await dbProxyRef.current.getDBUserInstances('databases').catch((e) => {
          showError({ title: 'Failed to get databases', message: e.message });
          return [];
        }),
      )
        .toArray()
        .map((row) => (row.toJSON() as DuckDBDatabase).database_name);

      const updatedViews = dbExternalViews.filter((view) =>
        dataSources?.some((source) => (view.comment || '').includes(source.id)),
      );

      const transformedTables = await updateDatabasesWithColumns(
        dbProxyRef.current,
        duckdbDatabases,
      );

      setDatabases(transformedTables);
      setViews(updatedViews);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      showError({ title: 'Failed to delete sources', message });
      console.error('Failed to delete sources: ', e);
    }
  };

  /**
   * Add data sources to the session
   */
  const onAddDataSources = async (entries: AddDataSourceProps) => {
    try {
      /**
       * Error handling. Check if the user selected any data sources and if the proxy is initialized
       */
      if (entries.length === 0) return;
      if (!dbProxyRef.current) throw new Error('Proxy not initialized');

      const onlyNewEntries = entries.filter(({ entry }) => {
        const exists = dataSources.some((item) => item.name === entry.name);
        return !exists;
      });

      if (onlyNewEntries.length !== entries.length) {
        showWarning({
          title: 'Warning',
          message: 'Some files were not added because they already exist.',
        });
      }

      /**
       * Register file handle in the navigator
       */
      await addSource(entries);

      await Promise.all(
        dataSources.map((source) =>
          dbProxyRef.current?.registerFileHandleAndCreateDBInstance(source).catch((e) => {
            console.error('Failed to register file handle in the database', e, { source });
            deleteSources([source.id]);
          }),
        ),
      );

      const dbExternalViews = tableFromIPC(await dbProxyRef.current.getDBUserInstances('views'))
        .toArray()
        .map((row) => row.toJSON().view_name);

      const duckdbDatabases = tableFromIPC(await dbProxyRef.current.getDBUserInstances('databases'))
        .toArray()
        .map((row) => row.toJSON().database_name);

      const newViews = dbExternalViews.filter((name) =>
        dataSources.some((source) => source.name === name),
      );

      const transformedTables = await updateDatabasesWithColumns(
        dbProxyRef.current,
        duckdbDatabases,
      );

      setDatabases(transformedTables);
      setViews(newViews);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      showError({ title: 'Failed to add data source', message });
      console.error(e);
    }
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

  const importSQLFiles = async () => {
    try {
      const fileHandles = await window.showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: 'SQL files',
            accept: { 'text/sql': ['.sql'] },
          },
        ],
      });

      // TODO: Create interface
      const importedEntries: { name: string; content: string }[] = [];

      for (const handle of fileHandles) {
        const file = await handle.getFile();
        const name = file.name.replace(/\.sql$/, '');
        const content = await file.text();

        importedEntries.push({
          name,
          content,
        });
      }

      if (importedEntries.length) {
        await createMultipleQueryFiles({ entities: importedEntries });
      }
    } catch (error) {
      console.error('Error importing SQL files: ', error);
    }
  };

  /**
   * Initialize the worker and the database worker. Fill the UI with the data from the session
   */
  useEffect(() => {
    /** NOTE: Create abort controller to cleanup worker */
    const controller = new AbortController();

    const initAppData = async () => {
      setAppStatus('initializing');

      const dbWorker = new Worker(new URL('./db-worker.ts', import.meta.url), {
        name: 'DBWorker',
        type: 'module',
      });
      const dbProxy = wrap<DBWorkerAPIType>(dbWorker);
      dbWorkerRef.current = dbWorker;
      dbProxyRef.current = dbProxy;

      if (controller.signal.aborted) return;

      /**
       * Initialize DB
       */
      await dbProxyRef.current
        .initDB()
        .catch((e) => showError({ title: 'Failed to initialize database', message: e.message }));

      /**
       * Get list of files in the session
       */
      const sessionFiles = await fileHandleStoreApi.getFileHandles().catch((e) => {
        showError({ title: 'Failed to get session files', message: e.message });
        return null;
      });

      /**
       * Check if the files are available for reading. Request permission if necessary
       */
      if (sessionFiles) {
        const statuses = await Promise.all(
          sessionFiles.map(async (source) => {
            const status = (await source.handle.queryPermission()) === 'granted';
            return status;
          }),
        );

        if (statuses.includes(false)) {
          const userResponse = await showPermsAlert();
          if (!userResponse) {
            return;
          }
          await Promise.all(
            sessionFiles.map(async (source) => {
              await source.handle.requestPermission({ mode: 'read' });
            }),
          );
        }

        /**
         * It is necessary to check if the file is available for reading. Application can't work with files that are not available (deleted, moved, renamed, etc.)
         */
        const checkedFiles = await Promise.all(
          sessionFiles.map(async (source) => {
            try {
              await source.handle.getFile();
              return {
                status: 'success',
                source,
              };
            } catch (e) {
              return {
                status: 'error',
                source,
              };
            }
          }),
        );

        const availableFiles = checkedFiles.filter((file) => file.status === 'success');
        const unavailableFiles = checkedFiles.filter((file) => file.status === 'error');

        if (unavailableFiles.length) {
          await deleteSources(unavailableFiles.map((file) => file.source.id));
          showWarning({
            title: 'Warning',
            message:
              'Some views/files were removed from the session memory because it is not possible to read them.',
          });
        }

        await Promise.all(
          sessionFiles
            .filter((source) =>
              availableFiles.some(
                (file) => file.source.path === source.path && file.status === 'success',
              ),
            )
            .map(async (source) =>
              dbProxy.registerFileHandleAndCreateDBInstance(source).catch((e) => {
                deleteSources([source.id]);
                showError({
                  title: 'Error registering file handle in the database',
                  message: e.message,
                });
              }),
            ),
        ).catch((e) => {
          console.error(e);
          showError({ title: 'Failed to register file handle', message: e.message });
        });
      }

      /**
       * Get views and databases from the database
       */
      const dbExternalViews: DuckDBView[] = tableFromIPC(
        await dbProxyRef.current.getDBUserInstances('views').catch((e) => {
          showError({ title: 'Failed to get views', message: e.message });
          return [];
        }),
      )
        .toArray()
        .map((row) => row.toJSON());

      const duckdbDatabases: string[] = tableFromIPC(
        await dbProxyRef.current.getDBUserInstances('databases').catch((e) => {
          showError({ title: 'Failed to get databases', message: e.message });
          return [];
        }),
      )
        .toArray()
        .map((row) => (row.toJSON() as DuckDBDatabase).database_name);

      const initViews = dbExternalViews.filter((view) =>
        sessionFiles?.some((source) => (view.comment || '').includes(source.id)),
      );

      const transformedTables = await updateDatabasesWithColumns(
        dbProxyRef.current,
        duckdbDatabases,
      );

      /**
       * Set the initial state of the application
       */
      setViews(initViews);
      setDatabases(transformedTables);
      setAppStatus('ready');
    };

    controller.signal.addEventListener('abort', () => {
      dbProxyRef.current?.[releaseProxy]();
      dbProxyRef.current = null;
      dbWorkerRef.current?.terminate();
      dbWorkerRef.current = null;
    });

    initAppData();

    return () => {
      controller.abort();
    };
  }, []);

  const value: AppContextType = {
    onAddDataSources,
    onDeleteDataSource,
    runQuery,
    onCancelQuery,
    importSQLFiles,
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
