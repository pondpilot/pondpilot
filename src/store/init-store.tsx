import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { v4 as uuidv4 } from 'uuid';
import { findUniqueName } from '@utils/helpers';
import { Tab, TabId, TabMetaInfo } from '@models/tab';
import { IDBPDatabase } from 'idb';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { ContentViewState } from '@models/content-view';
import { AnyDataSource, DataSource, DataSourceId } from '@models/data-source';
import { LocalEntry, LocalEntryId } from '@models/file-system';
import { localEntryFromHandle } from '@utils/file-system';
import { createCSVDataSource } from '@utils/data-sources/csv-data-source';
import { getSerializedDataSource } from '@utils/data-source';
import {
  CONTENT_VIEW_TABLE_NAME,
  DATA_SOURCE_TABLE_NAME,
  LOCAL_ENTRY_TABLE_NAME,
  SQL_SCRIPT_TABLE_NAME,
  TAB_TABLE_NAME,
} from './persist/const';
import { createSelectors } from './utils';
import { AppIdbSchema } from './persist/model';
import { resetAppData } from './persist/init';

type AppLoadState = 'init' | 'ready' | 'error';

type AppStore = {
  /**
   * Connection to the IndexedDB database. May be null if we had an error
   * while opening the database.
   *
   * This is a private property and should not be accessed directly.
   *
   * Used to persist the app state when connection is available.
   */
  _iDbConn: IDBPDatabase<AppIdbSchema> | null;

  /**
   * A mapping of local entry identifiers to their corresponding LocalEntry objects.
   */
  localEntries: Map<LocalEntryId, LocalEntry>;

  /**
   * A mapping of local entry identifiers to their corresponding DataSource objects.
   */
  dataSources: Map<DataSourceId, DataSource>;

  /**
   * The current state of the app, indicating whether it is loading, ready, or has encountered an error.
   */
  appLoadState: AppLoadState;

  /**
   * A mapping of SQL script identifiers to their corresponding SQLScript objects.
   */
  sqlScripts: Map<SQLScriptId, SQLScript>;
} & ContentViewState;

const initialState: AppStore = {
  _iDbConn: null,
  localEntries: new Map(),
  dataSources: new Map(),
  appLoadState: 'init',
  sqlScripts: new Map(),
  activeTabId: null,
  previewTabId: null,
  tabs: new Map(),
  tabOrder: [],
};

export const useInitStore =
  // Wrapper that creates simple getters, so you can just call
  // `useInitStore.use.someStateAttr()` instead of `useInitStore((state) => state.someStateAttr)`
  createSelectors(
    create<AppStore>()(
      // Adds redux devtools support - use in Chrome!
      devtools(() => initialState, { name: 'AppStore' }),
    ),
  );

// Common selectors
export function useSqlScriptIdForActiveTab(): SQLScriptId | null {
  return useInitStore((state) =>
    state.activeTabId ? (state.tabs.get(state.activeTabId)?.sqlScriptId ?? null) : null,
  );
}

export function useDataSourceIdForActiveTab(): DataSourceId | null {
  return useInitStore((state) =>
    state.activeTabId ? (state.tabs.get(state.activeTabId)?.dataSourceId ?? null) : null,
  );
}

// Memoized selectors

// We use separate memoized selectors for each necessary field, to avoid
// using complex comparator functions...

export function useSqlScript(sqlScriptId: SQLScriptId | null): SQLScript | null {
  return useInitStore(
    useShallow((state) => (sqlScriptId ? state.sqlScripts.get(sqlScriptId) || null : null)),
  );
}

export function useSqlScriptNameMap(): Map<SQLScriptId, string> {
  return useInitStore(
    useShallow(
      (state) =>
        new Map(
          Array.from(state.sqlScripts).map(([id, script]): [SQLScriptId, string] => [
            id,
            script.name,
          ]),
        ),
    ),
  );
}

export function useTabMetaInfoMap(): Map<TabId, TabMetaInfo> {
  return useInitStore(
    useShallow(
      (state) =>
        new Map(Array.from(state.tabs).map(([id, tab]): [TabId, TabMetaInfo] => [id, tab.meta])),
    ),
  );
}

// Actions / setters
export const setAppLoadState = (appState: AppLoadState) => {
  useInitStore.setState({ appLoadState: appState }, undefined, 'AppStore/setAppLoadState');
};

export const setIDbConn = (iDbConn: IDBPDatabase<AppIdbSchema>) => {
  useInitStore.setState({ _iDbConn: iDbConn }, undefined, 'AppStore/setIDbConn');
};

const persistAddLocalEntry = async (
  iDb: IDBPDatabase<AppIdbSchema>,
  newEntries: [LocalEntryId, LocalEntry][],
  newDataSources: [DataSourceId, AnyDataSource][],
) => {
  const tx = iDb.transaction([LOCAL_ENTRY_TABLE_NAME, DATA_SOURCE_TABLE_NAME], 'readwrite');

  // Add new local entries
  for (const [id, newLocalEntry] of newEntries) {
    await tx.objectStore(LOCAL_ENTRY_TABLE_NAME).put(newLocalEntry, id);
  }

  // Add new data sources
  for (const [id, newDataSource] of newDataSources) {
    await tx.objectStore(DATA_SOURCE_TABLE_NAME).put(getSerializedDataSource(newDataSource), id);
  }

  // Commit the transaction
  await tx.done;
};

export const addLocalFileOrFolders = (
  handles: (FileSystemDirectoryHandle | FileSystemFileHandle)[],
): {
  newEntries: [LocalEntryId, LocalEntry][];
  newDataSources: [DataSourceId, AnyDataSource][];
} => {
  const {
    _iDbConn: iDbConn,
    localEntries: _localEntries,
    dataSources: _dataSources,
  } = useInitStore.getState();

  const usedAliases = new Set(
    _localEntries
      .values()
      .filter((entry) => entry.kind === 'file')
      .map((entry) => entry.uniqueAlias),
  );

  const newEntries: [LocalEntryId, LocalEntry][] = [];
  const newDataSources: [DataSourceId, AnyDataSource][] = [];

  for (const handle of handles) {
    const localEntry = localEntryFromHandle(handle, null, true, (fileName: string): string => {
      const uniqueAlias = findUniqueName(fileName, (name: string) => usedAliases.has(name));
      usedAliases.add(uniqueAlias);
      return uniqueAlias;
    });

    if (!localEntry) {
      // Unsupported file type. Nothing to add to store.
      continue;
    }

    newEntries.push([localEntry.id, localEntry]);

    // Check if this is a data source file ad create a data source if so
    if (localEntry.kind === 'directory') {
      throw new Error('TODO');
    } else if (localEntry.fileType === 'data-source') {
      let dataSource: AnyDataSource | null = null;

      switch (localEntry.ext) {
        case 'csv':
          dataSource = createCSVDataSource(localEntry, (name: string) => name);
          break;
        default:
          throw new Error('TODO: Supported data source file type');
      }

      newDataSources.push([dataSource.id, dataSource]);
    }
  }

  // Create an object to pass to store update
  const newState: {
    localEntries: Map<LocalEntryId, LocalEntry>;
    dataSources?: Map<DataSourceId, DataSource>;
  } = {
    localEntries: new Map(Array.from(_localEntries).concat(newEntries)),
  };

  if (newDataSources.length > 0) {
    newState.dataSources = new Map(Array.from(_dataSources).concat(newDataSources));
  }

  // Update the store
  useInitStore.setState(newState, undefined, 'AppStore/addLocalEntry');

  // If we have an IndexedDB connection, persist the new local entry
  if (iDbConn) {
    persistAddLocalEntry(iDbConn, newEntries, newDataSources);
  }

  // Return the new local entry and data source
  return {
    newEntries,
    newDataSources,
  };
};

export const createSQLScript = (name: string = 'query', content: string = ''): SQLScript => {
  const { sqlScripts } = useInitStore.getState();
  const allNames = new Set(sqlScripts.values().map((script) => script.name));

  const fileName = findUniqueName(name, (value) => allNames.has(value));
  const sqlScriptId = uuidv4() as SQLScriptId;
  const sqlScript: SQLScript = {
    id: sqlScriptId,
    name: fileName,
    content,
  };

  // Add the new SQL script to the store
  useInitStore.setState(
    (state) => ({
      sqlScripts: new Map(state.sqlScripts).set(sqlScriptId, sqlScript),
    }),
    undefined,
    'AppStore/createSQLScript',
  );

  // Persist the new SQL script to IndexedDB
  const iDb = useInitStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(SQL_SCRIPT_TABLE_NAME, sqlScript, sqlScriptId);
  }

  return sqlScript;
};

export const setTabOrder = (tabOrder: TabId[]) => {
  useInitStore.setState({ tabOrder }, undefined, 'AppStore/setTabOrder');

  const iDb = useInitStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(CONTENT_VIEW_TABLE_NAME, tabOrder, 'tabOrder');
  }
};

/**
 * Sets/resets the active tab id.
 *
 * Idempotent, if the tab is already active, it does nothing.
 */
export const setActiveTabId = (tabId: TabId | null) => {
  const { activeTabId } = useInitStore.getState();

  // If the tab is already active, do nothing
  if (activeTabId === tabId) return;

  useInitStore.setState({ activeTabId: tabId }, undefined, 'AppStore/setActiveTabId');

  const iDb = useInitStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(CONTENT_VIEW_TABLE_NAME, tabId, 'activeTabId');
  }
};

/**
 * Sets/resets the preview tab id.
 *
 * Idempotent, if no state change is needed, it does nothing.
 *
 * Logic:
 * 1. No preview tab set, a new tabId is passed - just sets this tabId as preview.
 * 2. A preview tab is set, null is passed - resets the previewTabId, effectively making
 *  the preview tab a normal tab.
 * 3. A preview tab is set, a new tabId is passed - not only replaces the previewTabId but
 *  also deletes the old preview tab (with all associated logic of handling deleted active tabs),
 *  as only one preview tab is allowed at a time.
 *  NOTE: this logic doesn't set the preview tab as active! Use setActiveTabId for that.
 *
 * @param tabId - The id of the tab to set as preview or null to reset.
 */
export const setPreviewTabId = (tabId: TabId | null) => {
  const { tabs, tabOrder, activeTabId, previewTabId, _iDbConn: iDbConn } = useInitStore.getState();

  // Check we have stuff to do
  if (previewTabId === tabId) return;

  // Preview tabs are tricky. See logic above

  // Cases 2 (with deletion)
  if (previewTabId && tabId) {
    const { newTabs, newTabOrder, newActiveTabId } = deleteTabImpl(
      previewTabId,
      tabs,
      tabOrder,
      activeTabId,
      previewTabId,
    );

    // Update the store with the new state
    useInitStore.setState(
      {
        tabs: newTabs,
        tabOrder: newTabOrder,
        activeTabId: newActiveTabId,
        previewTabId: tabId,
      },
      undefined,
      'AppStore/setPreviewTabId',
    );

    if (iDbConn) {
      persistDeleteTab(iDbConn, previewTabId, newActiveTabId, tabId, newTabOrder);
    }

    return;
  }

  // Case 1 or 3
  useInitStore.setState({ previewTabId: tabId }, undefined, 'AppStore/setPreviewTabId');

  if (iDbConn) {
    iDbConn.put(CONTENT_VIEW_TABLE_NAME, tabId, 'previewTabId');
  }
};

const persistCreateTab = async (
  iDb: IDBPDatabase<AppIdbSchema>,
  tab: Tab,
  newTabOrder: TabId[],
) => {
  const tx = iDb.transaction([TAB_TABLE_NAME, CONTENT_VIEW_TABLE_NAME], 'readwrite');
  await tx.objectStore(TAB_TABLE_NAME).put(tab, tab.id);
  await tx.objectStore(CONTENT_VIEW_TABLE_NAME).put(newTabOrder, 'tabOrder');

  await tx.done;
};

const findTabFromScriptImpl = (tabs: Map<TabId, Tab>, sqlScriptId: SQLScriptId): Tab | undefined =>
  Array.from(tabs.values()).find((tab) => tab.sqlScriptId === sqlScriptId);

const findTabFromSourceImpl = (
  tabs: Map<TabId, Tab>,
  dataSourceId: DataSourceId,
): Tab | undefined => Array.from(tabs.values()).find((tab) => tab.dataSourceId === dataSourceId);

/**
 * Finds a tab displaying an existing data source or undefined.
 *
 * @param dataSourceOrId - The ID or a DataSource object to find the tab for.
 * @returns A new Tab object if found.
 * @throws An error if the DataSource with the given ID does not exist.
 */
export const findTabFromSource = (dataSourceOrId: DataSource | DataSourceId): Tab | undefined => {
  const state = useInitStore.getState();

  // Get the data source object if not passed as an object
  let dataSource: DataSource;
  if (typeof dataSourceOrId === 'string') {
    const fromState = state.dataSources.get(dataSourceOrId);

    if (!fromState) {
      throw new Error(`Data source with id ${dataSourceOrId} not found`);
    }

    dataSource = fromState;
  } else {
    dataSource = dataSourceOrId;
  }

  // Check if the script already has an associated tab
  return findTabFromSourceImpl(state.tabs, dataSource.id);
};

/**
 * Finds a tab displaying an existing SQL script or undefined.
 *
 * @param sqlScriptOrId - The ID or a SQL script object to find the tab for.
 * @returns A new Tab object if found.
 * @throws An error if the SQL script with the given ID does not exist.
 */
export const findTabFromScript = (sqlScriptOrId: SQLScript | SQLScriptId): Tab | undefined => {
  const state = useInitStore.getState();

  // Get the script object if not passed as an object
  let sqlScript: SQLScript;
  if (typeof sqlScriptOrId === 'string') {
    const fromState = state.sqlScripts.get(sqlScriptOrId);

    if (!fromState) {
      throw new Error(`SQL script with id ${sqlScriptOrId} not found`);
    }

    sqlScript = fromState;
  } else {
    sqlScript = sqlScriptOrId;
  }

  // Check if the script already has an associated tab
  return findTabFromScriptImpl(state.tabs, sqlScript.id);
};

/**
 * Creates a new tab from an existing SQL script.
 * If the SQL script is already associated with a tab, it returns that tab without creating a new one.
 *
 * @param sqlScriptOrId - The ID or a SQL script object to create a tab from.
 * @returns A new Tab object.
 * @throws An error if the SQL script with the given ID does not exist.
 */
export const createTabFromScript = (sqlScriptOrId: SQLScript | SQLScriptId): Tab => {
  const state = useInitStore.getState();

  // Get the script object if not passed as an object
  let sqlScript: SQLScript;
  if (typeof sqlScriptOrId === 'string') {
    const fromState = state.sqlScripts.get(sqlScriptOrId);

    if (!fromState) {
      throw new Error(`SQL script with id ${sqlScriptOrId} not found`);
    }

    sqlScript = fromState;
  } else {
    sqlScript = sqlScriptOrId;
  }

  // Check if the script already has an associated tab
  const existingTab = findTabFromScriptImpl(state.tabs, sqlScript.id);

  // No need to create a new tab if one already exists
  if (existingTab) {
    return existingTab;
  }

  // Create a new tab
  const tabId = uuidv4() as TabId;
  const tab: Tab = {
    id: tabId,
    meta: { name: sqlScript.name, iconType: 'code-file' },
    sqlScriptId: sqlScript.id,
    dataSourceId: null,
    layout: {
      tableColumnWidth: {},
      editorPaneHeight: 0,
      dataViewPaneHeight: 0,
    },
  };

  // Add the new tab to the store
  const newTabs = new Map(state.tabs).set(tabId, tab);
  const newTabOrder = [...state.tabOrder, tabId];

  useInitStore.setState(
    (_) => ({
      tabs: newTabs,
      tabOrder: newTabOrder,
    }),
    undefined,
    'AppStore/createTabFromScript',
  );

  // Persist the new tab to IndexedDB
  const iDb = state._iDbConn;
  if (iDb) {
    persistCreateTab(iDb, tab, newTabOrder);
  }

  return tab;
};

const persistDeleteTab = async (
  iDb: IDBPDatabase<AppIdbSchema>,
  deletedTabId: TabId,
  newActiveTabId: TabId | null,
  newPreviewTabId: TabId | null,
  newTabOrder: TabId[],
) => {
  const tx = iDb.transaction([TAB_TABLE_NAME, CONTENT_VIEW_TABLE_NAME], 'readwrite');
  await tx.objectStore(TAB_TABLE_NAME).delete(deletedTabId);

  const contentViewStore = tx.objectStore(CONTENT_VIEW_TABLE_NAME);
  await contentViewStore.put(newTabOrder, 'tabOrder');
  await contentViewStore.put(newActiveTabId, 'activeTabId');
  await contentViewStore.put(newPreviewTabId, 'previewTabId');

  await tx.done;
};

const deleteTabImpl = (
  deleteTabId: TabId,
  tabs: Map<TabId, Tab>,
  tabOrder: TabId[],
  activeTabId: TabId | null,
  previewTabId: TabId | null,
): {
  newTabs: Map<TabId, Tab>;
  newTabOrder: TabId[];
  newActiveTabId: TabId | null;
  newPreviewTabId: TabId | null;
} => {
  const newTabs = new Map(Array.from(tabs).filter(([id, _]) => id !== deleteTabId));
  const newTabOrder = tabOrder.filter((id) => id !== deleteTabId);
  let newActiveTabId = activeTabId;

  // If the active tab is being deleted, set active to the next one in order (or null)
  if (activeTabId === deleteTabId) {
    const prevTabIndex = tabOrder.findIndex((id) => id === deleteTabId) - 1;
    newActiveTabId = newTabOrder[prevTabIndex] || null;
  }

  // If the preview tab is being deleted, reset it to null
  const newPreviewTabId = previewTabId === deleteTabId ? null : previewTabId;

  return {
    newTabs,
    newTabOrder,
    newActiveTabId,
    newPreviewTabId,
  };
};

export const deleteTab = (tabId: TabId) => {
  const { tabs, tabOrder, activeTabId, previewTabId, _iDbConn: iDbConn } = useInitStore.getState();
  const { newTabs, newTabOrder, newActiveTabId, newPreviewTabId } = deleteTabImpl(
    tabId,
    tabs,
    tabOrder,
    activeTabId,
    previewTabId,
  );

  // Update the store with the new state
  useInitStore.setState(
    {
      tabs: newTabs,
      tabOrder: newTabOrder,
      activeTabId: newActiveTabId,
      previewTabId: newPreviewTabId,
    },
    undefined,
    'AppStore/deleteTab',
  );

  if (iDbConn) {
    persistDeleteTab(iDbConn, tabId, newActiveTabId, newPreviewTabId, newTabOrder);
  }
};

export const resetAppState = async () => {
  const { _iDbConn: iDbConn, appLoadState } = useInitStore.getState();

  // Drop all table data first
  if (iDbConn) {
    await resetAppData(iDbConn);
  }

  // Reset the store to its initial state except for the iDbConn and appLoadState
  useInitStore.setState(
    { ...initialState, _iDbConn: iDbConn, appLoadState },
    undefined,
    'AppStore/resetAppState',
  );
};
