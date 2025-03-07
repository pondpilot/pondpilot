/* eslint-disable no-console */
import { createContext, useContext, useEffect, useState } from 'react';
import { releaseProxy, wrap } from 'comlink';
import { useAppStore } from '@store/app-store';
import { tableFromIPC } from 'apache-arrow';
import { usePaginationStore } from '@store/pagination-store';
import { useAppNotifications } from '@components/app-notifications';
import { useAbortController } from '@hooks/useAbortController';
import { openDB } from 'idb';
import { notifications } from '@mantine/notifications';
import { Button, Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { createName } from '@utils/helpers';
import { AddDataSourceProps, SaveEditorProps } from '@models/common';
import { FILE_HANDLE_DB_NAME, FILE_HANDLE_STORE_NAME } from '@consts/idb';
import {
  AddTabProps,
  ChangeTabProps,
  CreateQueryFileProps,
  DBRunQueryProps,
  DBWorkerAPIType,
  OnSetOrderProps,
  RunQueryResponse,
  TabModel,
} from './models';
import { useShowPermsAlert, useWorkersRefs } from './hooks';
import { executeQueries, updateDatabasesWithColumns, verifyPermission } from './utils';
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
  onRenameDataSource: (oldPath: string, path: string) => Promise<void>;
  onSaveEditor: (props: SaveEditorProps) => Promise<void>;
  runQuery: (runQueryProps: DBRunQueryProps) => Promise<RunQueryResponse | undefined>;
  onCreateQueryFile: (v: CreateQueryFileProps) => Promise<void>;
  onCancelQuery: (v?: string) => void;
  onDeleteTabs: (tabs: TabModel[]) => Promise<void>;
  onTabUpdate: (tab: TabModel) => Promise<void>;
  onOpenView: (name: string) => Promise<void>;
  onOpenQuery: (queryName: string) => Promise<void>;
  onTabSwitch: (v: ChangeTabProps) => Promise<void>;
  exportFilesAsArchive: () => Promise<Blob | null | undefined>;
  importSQLFiles: () => Promise<void>;
  onSetTabsOrder: (v: OnSetOrderProps) => Promise<void>;
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
   * Store access
   */
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const setViews = useAppStore((state) => state.setViews);
  const setTabs = useAppStore((state) => state.setTabs);
  const setQueries = useAppStore((state) => state.setQueries);
  const setQueryRunning = useAppStore((state) => state.setQueryRunning);
  const setQueryResults = useAppStore((state) => state.setQueryResults);
  const setCurrentQuery = useAppStore((state) => state.setCurrentQuery);
  const setAppStatus = useAppStore((state) => state.setAppStatus);
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setQueryView = useAppStore((state) => state.setQueryView);
  const setOriginalQuery = useAppStore((state) => state.setOriginalQuery);
  const setCachedResults = useAppStore((state) => state.setCachedResults);
  const setDatabases = useAppStore((state) => state.setDatabases);
  const setSessionFiles = useAppStore((state) => state.setSessionFiles);

  const setCachedPagination = useAppStore((state) => state.setCachedPagination);
  const queries = useAppStore((state) => state.queries);
  const currentView = useAppStore((state) => state.currentView);
  const currentQuery = useAppStore((state) => state.currentQuery);
  const tabsStore = useAppStore((state) => state.tabs);
  const cachedResults = useAppStore((state) => state.cachedResults);
  const tabsState = useAppStore((state) => state.tabs);
  const cachedPagination = useAppStore((state) => state.cachedPagination);

  const setRowsCount = usePaginationStore((state) => state.setRowsCount);
  const setCurrentPage = usePaginationStore((state) => state.setCurrentPage);
  const resetPagination = usePaginationStore((state) => state.resetPagination);
  const setLimit = usePaginationStore((state) => state.setLimit);
  const setSort = usePaginationStore((state) => state.setSort);
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
        const result = await deleteSource(paths);

        setQueries(queries.filter((query) => !result?.paths.includes(query.path)));
      }

      const idbTabs = await proxyRef.current.getTabs();
      const tabsToDelete = idbTabs.filter((tab) => paths.includes(tab.path));

      await onDeleteTabs(tabsToDelete);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      showError({ title: 'App context: Failed to delete sources', message });
      console.error('Failed to delete sources: ', e);
    }
  };

  const onRenameDataSource: AppContextType['onRenameDataSource'] = async (path, newPath) => {
    if (!proxyRef.current) return;

    try {
      const updatedItem = await proxyRef.current?.onRenameDataSource({
        newPath,
        path,
      });

      const updatedTab = tabsStore.find((tab) => tab.path === path);

      if (updatedTab && updatedItem?.path) {
        await proxyRef.current.updateTabState({
          ...updatedTab,
          path: updatedItem?.path,
        });
        const idbTabs = await proxyRef.current.getTabs();
        setTabs(idbTabs);
      }

      if (currentQuery === path && updatedItem) {
        setCurrentQuery(updatedItem.name);
      }

      const currentSources = await proxyRef.current.getFileSystemSources();

      setQueries(currentSources?.editors ?? []);
    } catch (e: any) {
      console.error('Error renaming file:', e);
      showError({ title: 'Error renaming file', message: e.message });
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

      const db = await openDB(FILE_HANDLE_DB_NAME, 1);
      const allKeys = await db.getAllKeys(FILE_HANDLE_STORE_NAME);
      const items: FileSystemFileHandle[] = await Promise.all(
        allKeys.map(async (key) => db.get(FILE_HANDLE_STORE_NAME, key)),
      );

      const onlyNewEntries = entries.filter(({ entry }) => {
        const exists = items.some((item) => item.name === entry.name);
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
      const sources = await proxyRef.current.onAddDataSource({
        entries: onlyNewEntries,
      });

      await Promise.all(
        sources.map((source) =>
          dbProxyRef.current
            ?.registerFileHandleAndCreateDBInstance(source.handle.name, source.handle)
            .catch((e) => {
              console.error('Failed to register file handle in the database', e, { source });
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

      setSessionFiles(sessionFiles);
      setDatabases(transformedTables);
      setViews(newViews);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      showError({ title: 'App context: Failed to add data source', message });
      console.error(e);
    }
  };

  /**
   * Add query to the session
   */
  const onCreateQueryFile = async ({ entities, openInNewTab }: CreateQueryFileProps) => {
    if (!proxyRef.current) return;

    try {
      const newEditors = await Promise.all(
        entities.map(async ({ name, content }) => proxyRef.current!.createQueryFile(name, content)),
      );

      const validEditors = newEditors.filter((editor) => editor !== null);

      if (validEditors.length === 0) throw new Error('Failed to create queries');

      const files = await Promise.all(validEditors.map((editor) => editor.handle.getFile()));
      const contents = await Promise.all(files.map((file) => file.text()));

      const newQueries = validEditors.map((editor, index) => ({
        ...editor,
        content: contents[index],
      }));
      const currentSources = await proxyRef.current.getFileSystemSources();

      setQueries(currentSources?.editors ?? []);

      await onOpenQuery(newQueries[0].path);
      await onTabSwitch({
        path: newQueries[0].path,
        mode: 'query',
        stable: true,
        createNew: !!openInNewTab,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      console.error('App context: Failed to create queries: ', e);
      showError({ message, title: 'App context: Failed to create queries' });
    }
  };

  const executeQuery = async (query: string) => {
    if (!dbProxyRef.current) return;

    try {
      const result = await dbProxyRef.current.runQuery({ query });

      return tableFromIPC(result.data);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      console.error('Error executing query:', message);
      showError({ title: 'Error executing query', message });
    }
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
      const currentSources = await proxyRef.current.getFileSystemSources();

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
        currentSources,
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
        const filesToDelete = currentSources?.sources.filter(
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
          currentSources?.sources.some((source) => source.name === view),
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
        setQueryResults(tableFromIPC(queryResults.data));
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

  const onCancelQuery = (reason?: string) => {
    abortSignal(reason);
    setQueryRunning(false);
  };
  /**
   * Save query
   */
  const onSaveEditor = async (props: SaveEditorProps) => {
    if (!proxyRef.current) return;

    try {
      const result = await proxyRef.current.onSaveEditor(props);

      if (result.error) throw result.error;

      if (!result.handle) throw new Error('Failed to save editor');

      const currentSources = await proxyRef.current.getFileSystemSources();

      setQueries(currentSources?.editors ?? []);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      console.error('App context: Failed to save editor: ', e);
      showError({ title: 'App context: Failed to save editor', message });
    }
  };

  /**
   * Open query file
   */
  const onOpenQuery = async (path: string) => {
    /**
     * Reset the current view and query cachedResults to avoid showing the previous query cachedResults
     */
    setCurrentView(null);
    setQueryResults(null);
    setRowsCount(0);
    setOriginalQuery('');

    /**
     * Set the current query and query view
     */
    setQueryView(true);
    setCurrentQuery(path);
  };

  const onOpenView = async (viewName: string) => {
    if (!proxyRef.current || !dbProxyRef.current) return;
    try {
      if (viewName === currentView) {
        return;
      }
      setCurrentQuery(null);
      setQueryView(false);
      setCurrentView(viewName);
      const query = viewName ? `select  * from ${createName(viewName)}` : '';
      setOriginalQuery(query);

      if (cachedResults[viewName]) {
        setQueryResults(cachedResults[viewName]);

        if (cachedPagination[viewName]) {
          setSort(cachedPagination[viewName].sort);
          setRowsCount(cachedPagination[viewName].rowsCount);
          setCurrentPage(cachedPagination[viewName].currentPage);
          setLimit(cachedPagination[viewName].limit);
        }

        onTabSwitch({
          path: viewName,
          mode: 'view',
        });
        return;
      }

      /**
       * Reset query state before opening the view
       */
      setQueryResults(null);
      setQueryRunning(true);
      resetPagination();

      if (query) {
        const result = await runQuery({ query });

        if (result) {
          setCachedResults(viewName, tableFromIPC(result.data));
          setCachedPagination(viewName, {
            rowsCount: result.pagination,
            limit: 100,
            currentPage: 1,
            sort: { field: null, direction: null },
          });
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setCurrentView(null);
      console.error('App context: Failed to open view: ', e);
      showError({ title: 'App context: Failed to open view', message });
    } finally {
      setQueryRunning(false);
    }
  };

  const onSetTabsOrder = async ({ tabs, activeTabIndex }: OnSetOrderProps) => {
    if (!proxyRef.current) return;
    try {
      await proxyRef.current.setTabsOrder(tabs);

      const updatedTabs = await proxyRef.current.getTabs();

      setTabs(updatedTabs);
      if (Number.isInteger(activeTabIndex)) {
        setActiveTab(updatedTabs[activeTabIndex]);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      console.error('App context: Failed to set tabs order: ', e);
      showError({ title: 'App context: Failed to set tabs order', message });
    }
  };

  const onTabSwitch = async ({ path, stable = false, mode, createNew }: ChangeTabProps) => {
    if (!proxyRef.current) return;

    try {
      const tabBase = { path, mode, stable };
      const hasTab = tabsState.find((tab) => tab.path === path);
      const addNewTab = async () => {
        const tab = await onAddTab(tabBase);
        if (tab) {
          setActiveTab(tab);
        }
      };

      if (hasTab) {
        setActiveTab(hasTab);
        return;
      }

      if (!activeTab || createNew) {
        addNewTab();
        return;
      }

      /**
       * If user sets another tab, but current tab is unstable, update the current tab
       */
      const unstableTab = tabsState.find((tab) => tab.stable === false);

      if (unstableTab) {
        const tabUpdatePayload = {
          ...tabBase,
          id: unstableTab.id,
        };
        setActiveTab(tabUpdatePayload);
        setCachedResults(unstableTab.path, null);
        setCachedPagination(unstableTab.path, null);

        onTabUpdate(tabUpdatePayload);
      } else {
        addNewTab();
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      console.error('App context: Failed to switch tab: ', message);
      showError({ title: 'App context: Failed to switch tab', message });
    }
  };

  const onAddTab = async (tab: AddTabProps) => {
    if (!proxyRef.current) return;
    try {
      const createdTab = await proxyRef.current.addTab(tab);

      const idbTabs = await proxyRef.current.getTabs();
      setTabs(idbTabs);
      return createdTab;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      console.error('App context: Failed to add tab: ', message);
      showError({ title: 'App context: Failed to add tab', message });
    }
  };

  const onTabUpdate = async (tab: TabModel) => {
    if (!proxyRef.current) return;

    try {
      await proxyRef.current.updateTabState(tab);

      const idbTabs = await proxyRef.current.getTabs();
      if (tab.id === activeTab?.id) {
        setActiveTab(tab);
      }
      setTabs(idbTabs);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';

      console.error('App context: Failed to update tab:', message);
      showError({ title: 'App context: Failed to update tab', message });
    }
  };

  const onDeleteTabs = async (tabsToDelete: TabModel[]) => {
    if (!proxyRef.current) return;

    try {
      await proxyRef.current.deleteTabs(
        tabsToDelete.map((tab) => {
          setCachedResults(tab.path, null);
          setCachedPagination(tab.path, null);
          return tab.id;
        }),
      );

      /**
       * If the current view or query is in the list of tabs to delete, reset the current view and query
       */
      if (tabsToDelete.some((tab) => tab.path === currentView || tab.path === currentQuery)) {
        setCurrentView(null);
        setQueryResults(null);
        setQueryView(false);
        setCurrentQuery(null);
      }

      const updatedIdbTabs = await proxyRef.current.getTabs();

      if (tabsToDelete.some((tab) => tab.path === activeTab?.path)) {
        const lastTab = updatedIdbTabs[updatedIdbTabs.length - 1];

        if (lastTab) {
          onTabSwitch({
            path: lastTab.path,
            mode: lastTab.mode,
          });

          if (lastTab.mode === 'view') {
            onOpenView(lastTab.path);
          } else {
            onOpenQuery(lastTab.path);
          }
        } else {
          setActiveTab(null);
          setQueryResults(null);
          setOriginalQuery('');
        }
      }
      setTabs(updatedIdbTabs);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      console.error('App context: Failed to delete tabs: ', message);
      showError({ title: 'App context: Failed to delete tabs', message });
    }
  };

  const exportFilesAsArchive = async () => {
    if (!proxyRef.current) return;
    try {
      const result = await proxyRef.current.exportFilesAsArchive();
      if (!result) throw new Error('Failed to export files as archive');
      return result;
    } catch (error) {
      console.error('Error exporting files as archive: ', error);
    }
  };

  const importSQLFiles = async () => {
    if (!proxyRef.current) return;
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
      const result = await proxyRef.current.importSQLFiles(fileHandles);

      if (result.length) {
        await onCreateQueryFile({ entities: result });
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
      const sessionFiles = await proxyRef.current.getFileSystemSources().catch((e) => {
        showError({ title: 'App context: Failed to get session files', message: e.message });
        return null;
      });

      /**
       * Check if the files are available for reading. Request permission if necessary
       */
      if (sessionFiles?.sources) {
        const statuses = await Promise.all(
          sessionFiles.sources.map(async (source) => {
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
            sessionFiles.sources.map(async (source) => {
              await source.handle.requestPermission({ mode: 'read' });
            }),
          );
        }

        /**
         * It is necessary to check if the file is available for reading. Application can't work with files that are not available (deleted, moved, renamed, etc.)
         */
        const checkedFiles = await Promise.all(
          sessionFiles.sources.map(async (source) => {
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
          sessionFiles.sources
            .filter((source) =>
              availableFiles.some(
                (file) => file.source.path === source.path && file.status === 'success',
              ),
            )
            .map(async (source) =>
              dbProxy
                .registerFileHandleAndCreateDBInstance(source.handle.name, source.handle)
                .catch((e) => {
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
      const dbExternalViews = tableFromIPC(
        await dbProxyRef.current.getDBUserInstances('views').catch((e) => {
          showError({ title: 'App context: Failed to get views', message: e.message });
          return [];
        }),
      )
        .toArray()
        .map((row) => row.toJSON().view_name);

      const duckdbDatabases = tableFromIPC(
        await dbProxyRef.current.getDBUserInstances('databases').catch((e) => {
          showError({ title: 'App context: Failed to get databases', message: e.message });
          return [];
        }),
      )
        .toArray()
        .map((row) => row.toJSON().database_name);

      const initViews = dbExternalViews.filter((name) =>
        sessionFiles?.sources?.some((source) => source.name === name),
      );

      const idbTabs = await proxyRef.current.getTabs();

      const viewsTabs = idbTabs.filter((tab) => tab.mode === 'view');
      const queriesTabs = idbTabs.filter((tab) => tab.mode === 'query');

      /**
       * Delete tabs that are not in the session
       */
      const viewsTabsToDelete = viewsTabs.filter(
        (tab) => !sessionFiles?.sources.some((source) => source.name === tab.path),
      );

      const queriesTabsToDelete = queriesTabs.filter(
        (tab) => !sessionFiles?.editors.some((editor) => editor.path === tab.path),
      );

      if (viewsTabsToDelete.length || queriesTabsToDelete.length) {
        await onDeleteTabs([...viewsTabsToDelete, ...queriesTabsToDelete]);
      }

      const isExistingEntity = (tab: TabModel) =>
        sessionFiles?.sources.some((source) => source.name === tab.path) ||
        sessionFiles?.editors.some((editor) => editor.path === tab.path);

      const existingEntityTabs = idbTabs.filter(isExistingEntity);

      /**
       * If there are tabs in the session, set the first tab as active
       */
      if (existingEntityTabs.length) {
        const [firstTab] = existingEntityTabs;
        setActiveTab(firstTab);

        if (firstTab.mode === 'view') {
          onOpenView(firstTab.path);
        }
        if (firstTab.mode === 'query') {
          onOpenQuery(firstTab.path);
        }
      }

      const transformedTables = await updateDatabasesWithColumns(
        dbProxyRef.current,
        duckdbDatabases,
      );

      /**
       * Set the initial state of the application
       */
      setSessionFiles(sessionFiles);
      setTabs(existingEntityTabs);
      setViews(initViews);
      setDatabases(transformedTables);
      setQueries(sessionFiles?.editors ?? []);
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

    if ('showDirectoryPicker' in window && 'showOpenFilePicker' in window) {
      initAppData();
    } else {
      showError({
        title: 'Error',
        color: 'red',
        message: 'Browser is not supported',
        autoClose: false,
      });
      setAppStatus('ready');
    }

    return () => {
      controller.abort();
    };
  }, []);

  const value: AppContextType = {
    onAddDataSources,
    onCreateQueryFile,
    onDeleteDataSource,
    runQuery,
    onSaveEditor,
    onCancelQuery,
    onRenameDataSource,
    onDeleteTabs,
    onTabUpdate,
    onOpenView,
    onTabSwitch,
    onOpenQuery,
    exportFilesAsArchive,
    importSQLFiles,
    onSetTabsOrder,
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
