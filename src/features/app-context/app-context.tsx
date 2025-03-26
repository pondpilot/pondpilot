import { createContext, useContext, useEffect, useState } from 'react';
import { releaseProxy, wrap } from 'comlink';
import { useAppStore } from '@store/app-store';
import { tableFromIPC } from 'apache-arrow';
import { usePaginationStore } from '@store/pagination-store';
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
  useFileHandlesQuery,
} from '@store/app-idb-store';
import { DBRunQueryProps, DBWorkerAPIType, RunQueryResponse } from './models';
import { useShowPermsAlert, useWorkersRefs } from './hooks';
import { executeQueries, updateDatabasesWithColumns } from './utils';
import { SessionWorker } from './app-session-worker';
import { ErrorModal } from './components/error-modal';

interface AppContextType {
  onAddDataSources: (entries: AddDataSourceProps) => Promise<any>;
  onDeleteDataSource: ({
    type,
    paths,
  }: {
    type: 'database' | 'query' | 'view';
    paths: string[];
  }) => Promise<void>;
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
  const { workerRef, proxyRef, dbWorkerRef, dbProxyRef } = useWorkersRefs();

  /**
   * Local state
   */
  const [errorModalOpened, { open: openErrorModal, close: closeErrorModal }] = useDisclosure(false);
  const [errortext, setErrorModalText] = useState('');

  /**
   * Query state
   */
  const { mutateAsync: createMultipleQueryFiles } = useCreateMultipleQueryFilesMutation();
  const { mutateAsync: addSource } = useAddFileHandlesMutation();
  const { data: dataSources = [] } = useFileHandlesQuery();

  /**
   * Store access
   */
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const setViews = useAppStore((state) => state.setViews);
  const setQueryRunning = useAppStore((state) => state.setQueryRunning);
  const setQueryResults = useAppStore((state) => state.setQueryResults);
  const setAppStatus = useAppStore((state) => state.setAppStatus);
  const setOriginalQuery = useAppStore((state) => state.setOriginalQuery);
  const setDatabases = useAppStore((state) => state.setDatabases);

  const currentView = useAppStore((state) => state.currentView);

  const setRowsCount = usePaginationStore((state) => state.setRowsCount);
  const limit = usePaginationStore((state) => state.limit);
  const currentPage = usePaginationStore((state) => state.currentPage);

  const handleClosingErrorModal = () => {
    setErrorModalText('');
    closeErrorModal();
  };

  /**
   * Delete data source from the session
   */
  const onDeleteDataSource: AppContextType['onDeleteDataSource'] = async ({ paths, type }) => {
    if (!proxyRef.current || !dbProxyRef.current) return;

    const deleteSource = async (_paths: string[]) => {
      if (!proxyRef.current || !dbProxyRef.current) {
        return null;
      }

      const result = await proxyRef.current.onDeleteDataSource({
        paths: _paths,
        type: type === 'query' ? 'query' : 'dataset',
      });

      return result;
    };

    try {
      if (type === 'database' || type === 'view') {
        const sourcesData = await proxyRef.current.getFileSystemSources();

        if (!sourcesData) throw new Error('Failed to get sources data');

        const filesPathsToDelete = sourcesData?.sources.filter((source) =>
          paths.includes(source.name),
        );

        await deleteSource(filesPathsToDelete.map((file) => file.path));
        await dbProxyRef.current.dropFilesAndDBInstances(
          filesPathsToDelete.map((file) => file.name),
          type,
        );

        if (currentView && filesPathsToDelete.some((file) => file.name === currentView)) {
          setCurrentView(null);
          setQueryResults(null);
        }

        const dbExternalViews = tableFromIPC(await dbProxyRef.current.getDBUserInstances('views'))
          .toArray()
          .map((row) => row.toJSON().view_name);
        const duckdbDatabases = tableFromIPC(
          await dbProxyRef.current.getDBUserInstances('databases'),
        )
          .toArray()
          .map((row) => row.toJSON().database_name);

        const updatedViews = dbExternalViews.filter((name) =>
          sourcesData?.sources?.some((source) => source.name === name),
        );

        const transformedTables = await updateDatabasesWithColumns(
          dbProxyRef.current,
          duckdbDatabases,
        );

        setDatabases(transformedTables);
        setViews(updatedViews);
      }

      if (type === 'query') {
        // const result = await deleteSource(paths);
        // setQueries(queries.filter((query) => !result?.paths.includes(query.path)));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      showError({ title: 'App context: Failed to delete sources', message });
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
      if (entries.length === 0) throw new Error('No data sources selected');
      if (!proxyRef.current || !dbProxyRef.current) throw new Error('Proxy not initialized');

      const onlyNewEntries = entries.filter(({ entry }) => {
        const exists = dataSources.some((item) => item.name === entry.name);
        return !exists;
      });

      if (onlyNewEntries.length !== entries.length) {
        showWarning({
          title: 'App context: Warning',
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
            proxyRef.current?.onDeleteDataSource({
              paths: [source.path],
              type: 'dataset',
            });
          }),
        ),
      );

      const sessionFiles = await proxyRef.current.getFileSystemSources().catch((e) => {
        showError({ title: 'App context: Failed to get session files', message: e.message });
        return null;
      });

      const dbExternalViews = tableFromIPC(await dbProxyRef.current.getDBUserInstances('views'))
        .toArray()
        .map((row) => row.toJSON().view_name);

      const duckdbDatabases = tableFromIPC(await dbProxyRef.current.getDBUserInstances('databases'))
        .toArray()
        .map((row) => row.toJSON().database_name);

      const newViews = dbExternalViews.filter((name) =>
        sessionFiles?.sources?.some((source) => source.name === name),
      );

      const transformedTables = await updateDatabasesWithColumns(
        dbProxyRef.current,
        duckdbDatabases,
      );

      setDatabases(transformedTables);
      setViews(newViews);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      showError({ title: 'App context: Failed to add data source', message });
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
      if (!dbProxyRef.current || !proxyRef.current) throw new Error('Proxy not initialized');

      // Create a cancelation signal to support cancelable queries
      const signal = getSignal();
      const isCancelledPromise = new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });

      const queryProps = !runQueryProps.isPagination
        ? { ...runQueryProps, limit, offset: (currentPage - 1) * limit }
        : runQueryProps;

      // Use executeQueries utility function to parse and execute the query
      const { queryResults, originalQuery } = await executeQueries({
        runQueryProps: queryProps,
        dbProxyRef,
        isCancelledPromise,
        currentSources: dataSources,
      });

      // Set the original query in the state for later reference
      if (!runQueryProps.isPagination) {
        setOriginalQuery(originalQuery);
      }

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
          await proxyRef.current.onDeleteDataSource({
            paths: filesToDelete.map((file) => file.path),
            type: 'dataset',
          });
          showSuccess({ title: 'Success', message: 'View deleted' });
        }

        // Filter out unused views and update the state
        const filteredViews = viewsNames.filter((view) =>
          dataSources?.some((source) => source.name === view),
        );

        // If the current view is deleted, reset it
        if (filesToDelete?.some((file) => file.name === currentView)) {
          setCurrentView(null);
        }

        const transformedTables = await updateDatabasesWithColumns(dbProxyRef.current, dbsNames);

        // Update the application state with processed data
        setDatabases(transformedTables);
        setViews(filteredViews);
        setRowsCount(queryResults.pagination);
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
        title: 'App context: Failed to run query',
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
      setQueryRunning(false);
    }
  };

  const onCancelQuery = async (reason?: string) => {
    abortSignal(reason);
    setQueryRunning(false);
  };

  const verifyPermission = async (fileHandle: FileSystemFileHandle) => {
    if ((await fileHandle.queryPermission()) === 'granted') {
      return true;
    }

    return false;
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
      const { worker, proxy, dbWorker, dbProxy } = await initWorkers();
      workerRef.current = worker;
      proxyRef.current = proxy;
      dbWorkerRef.current = dbWorker;
      dbProxyRef.current = dbProxy;
      if (controller.signal.aborted) return;

      /**
       * Initialize DB
       */
      await dbProxyRef.current
        .initDB()
        .catch((e) =>
          showError({ title: 'App context: Failed to initialize database', message: e.message }),
        );

      /**
       * Get list of files in the session
       */
      const sessionFiles = await fileHandleStoreApi.getFileHandles().catch((e) => {
        showError({ title: 'App context: Failed to get session files', message: e.message });
        return null;
      });

      /**
       * Check if the files are available for reading. Request permission if necessary
       */
      if (sessionFiles) {
        const statuses = await Promise.all(
          sessionFiles.map(async (source) => {
            const status = await verifyPermission(source.handle);
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
          await proxyRef.current?.onDeleteDataSource({
            paths: unavailableFiles.map((file) => file.source.path),
            type: 'dataset',
          });
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
                proxyRef.current?.onDeleteDataSource({
                  paths: [source.path],
                  type: 'dataset',
                });
                showError({
                  title: 'App context: Error registering file handle in the database',
                  message: e.message,
                });
              }),
            ),
        ).catch((e) => {
          console.error(e);
          showError({ title: 'App context: Failed to register file handle', message: e.message });
        });
      }

      /**
       * Get views and databases from the database
       */
      const dbExternalViews: DuckDBView[] = tableFromIPC(
        await dbProxyRef.current.getDBUserInstances('views').catch((e) => {
          showError({ title: 'App context: Failed to get views', message: e.message });
          return [];
        }),
      )
        .toArray()
        .map((row) => row.toJSON());

      const duckdbDatabases: string[] = tableFromIPC(
        await dbProxyRef.current.getDBUserInstances('databases').catch((e) => {
          showError({ title: 'App context: Failed to get databases', message: e.message });
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
      proxyRef.current?.[releaseProxy]();
      proxyRef.current = null;
      workerRef.current?.terminate();
      workerRef.current = null;

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

export const initWorkers = async () => {
  const worker = new Worker(new URL('./app-session-worker.ts', import.meta.url), {
    name: 'SessionWorker',
    type: 'module',
  });

  const dbWorker = new Worker(new URL('./db-worker.ts', import.meta.url), {
    name: 'DBWorker',
    type: 'module',
  });

  const proxy = wrap<SessionWorker>(worker);
  const dbProxy = wrap<DBWorkerAPIType>(dbWorker);

  return {
    worker,
    proxy,
    dbWorker,
    dbProxy,
  };
};
