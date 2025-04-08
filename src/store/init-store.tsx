import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { v4 as uuidv4 } from 'uuid';
import { findUniqueName } from '@utils/helpers';
import { AnyTab, FileDataSourceTab, ScriptTab, TabId, TabMetaInfo } from '@models/tab';
import { IDBPDatabase } from 'idb';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { ContentViewState } from '@models/content-view';
import {
  AnyPersistentDataView,
  PersistentDataViewId,
  PersistentDataViewData,
} from '@models/data-view';
import { DataSourceLocalFile, LocalEntry, LocalEntryId } from '@models/file-system';
import { localEntryFromHandle } from '@utils/file-system';

import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import {
  registerAndAttachDatabase,
  registerFileSourceAndCreateView,
} from '@controllers/db/file-handle';
import {
  CONTENT_VIEW_TABLE_NAME,
  DATA_VIEW_TABLE_NAME,
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
   * The current state of the app, indicating whether it is loading, ready, or has encountered an error.
   */
  appLoadState: AppLoadState;

  /**
   * A mapping of persistent data view ids to their corresponding objects.
   */
  dataViews: Map<PersistentDataViewId, PersistentDataViewData>;

  /**
   * A mapping of local entry identifiers to their corresponding LocalEntry objects.
   */
  localEntries: Map<LocalEntryId, LocalEntry>;

  /**
   * A mapping of SQL script identifiers to their corresponding SQLScript objects.
   */
  sqlScripts: Map<SQLScriptId, SQLScript>;

  /**
   * TODO!!!
   * a maximum of N rows of data per tab used to display tabs after refresh or re-open
   * a tab before actual data is loaded.
   */
  tabDataCache: Map<TabId, any>;

  /**
   * A mapping of tab identifiers to their corresponding Tab objects.
   */
  tabs: Map<TabId, AnyTab>;
} & ContentViewState;

const initialState: AppStore = {
  _iDbConn: null,
  appLoadState: 'init',
  dataViews: new Map(),
  localEntries: new Map(),
  sqlScripts: new Map(),
  tabDataCache: new Map(),
  tabs: new Map(),
  // From ContentViewState
  activeTabId: null,
  previewTabId: null,
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
  return useInitStore((state) => {
    if (!state.activeTabId) return null;

    const tab = state.tabs.get(state.activeTabId);
    if (!tab) return null;
    if (tab.type !== 'script') {
      console.warn(`Attempted to get SQLScriptId for non-script tab: ${tab.id}`);
      return null;
    }

    return tab.sqlScriptId;
  });
}

export function useDataViewIdForActiveTab(): PersistentDataViewId | null {
  return useInitStore((state) => {
    if (!state.activeTabId) return null;

    const tab = state.tabs.get(state.activeTabId);
    if (!tab) return null;
    if (tab.type !== 'data-source') {
      console.warn(`Attempted to get DataSourceId for non-data-source tab: ${tab.id}`);
      return null;
    }

    return tab.dataViewId;
  });
}

// Memoized selectors

// We use separate memoized selectors for each necessary field, to avoid
// using complex comparator functions...

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
  newDataViews: [PersistentDataViewId, AnyPersistentDataView][],
) => {
  const tx = iDb.transaction([LOCAL_ENTRY_TABLE_NAME, DATA_VIEW_TABLE_NAME], 'readwrite');

  // Add new local entries
  for (const [id, newLocalEntry] of newEntries) {
    await tx.objectStore(LOCAL_ENTRY_TABLE_NAME).put(newLocalEntry, id);
  }

  // Add new data sources
  for (const [id, newDataView] of newDataViews) {
    await tx.objectStore(DATA_VIEW_TABLE_NAME).put(newDataView, id);
  }

  // Commit the transaction
  await tx.done;
};

function addPersistentDataView(localEntry: DataSourceLocalFile): AnyPersistentDataView {
  const dataViewId = uuidv4() as PersistentDataViewId;

  // TODO: fetch all views currently in memory db from state to avoid duplicates
  const reservedViews = new Set([] as string[]);
  const viewName = findUniqueName(toDuckDBIdentifier(localEntry.uniqueAlias), (name: string) =>
    reservedViews.has(name),
  );

  switch (localEntry.ext) {
    case 'csv':
      return {
        id: dataViewId,
        type: 'persistent',
        sourceType: localEntry.ext,
        fileSourceId: localEntry.id,
        displayName: viewName,
        queryableName: viewName,
        fullyQualifiedName: `main.${viewName}`,
      };
    case 'parquet':
      return {
        id: dataViewId,
        type: 'persistent',
        sourceType: localEntry.ext,
        fileSourceId: localEntry.id,
        displayName: viewName,
        queryableName: viewName,
        fullyQualifiedName: `main.${viewName}`,
        registeredFileName: localEntry.uniqueAlias,
      };
    default:
      throw new Error('TODO: Supported data source file type');
  }
}

export const addLocalFileOrFolders = async (
  db: AsyncDuckDB,
  conn: AsyncDuckDBConnection,
  handles: (FileSystemDirectoryHandle | FileSystemFileHandle)[],
) => {
  const { _iDbConn: iDbConn, localEntries, dataViews } = useInitStore.getState();

  const usedAliases = new Set(
    localEntries
      .values()
      .filter((entry) => entry.kind === 'file')
      .map((entry) => entry.uniqueAlias),
  );

  const newEntries: [LocalEntryId, LocalEntry][] = [];
  const newDataViews: [PersistentDataViewId, AnyPersistentDataView][] = [];

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
      switch (localEntry.ext) {
        case 'duckdb': {
          // TODO: fetch all attached dbs in memory db from state to avoid duplicates
          const reservedDbs = new Set([] as string[]);
          const dbName = findUniqueName(
            toDuckDBIdentifier(localEntry.uniqueAlias),
            (name: string) => reservedDbs.has(name),
          );

          await registerAndAttachDatabase(
            db,
            conn,
            localEntry.handle,
            localEntry.uniqueAlias,
            dbName,
          );
          break;
        }
        default: {
          // First create a data view object
          const dataView = addPersistentDataView(localEntry);

          // Then register the file source and create the view.
          // TODO: this may potentially fail - we should handle this case
          await registerFileSourceAndCreateView(
            db,
            conn,
            localEntry.handle,
            `${localEntry.uniqueAlias}.${localEntry.ext}`,
            dataView.queryableName,
          );

          newDataViews.push([dataView.id, dataView]);
          break;
        }
      }
    }
  }

  // Create an object to pass to store update
  const newState: {
    localEntries: Map<LocalEntryId, LocalEntry>;
    dataViews?: Map<PersistentDataViewId, PersistentDataViewData>;
  } = {
    localEntries: new Map(Array.from(localEntries).concat(newEntries)),
  };

  if (newDataViews.length > 0) {
    newState.dataViews = new Map(Array.from(dataViews).concat(newDataViews));
  }

  // Update the store
  useInitStore.setState(newState, undefined, 'AppStore/addLocalEntry');

  // If we have an IndexedDB connection, persist the new local entry
  if (iDbConn) {
    persistAddLocalEntry(iDbConn, newEntries, newDataViews);
  }

  // Return the new local entry and data source
  return {
    newEntries,
    newDataViews,
  };
};

export const importSQLFilesAndCreateScripts = async (handles: FileSystemFileHandle[]) => {
  const { _iDbConn: iDbConn, sqlScripts } = useInitStore.getState();

  const newScripts: [SQLScriptId, SQLScript][] = [];

  for (const handle of handles) {
    const fileName = handle.name;
    const nameWithoutExt = fileName.split('.').slice(0, -1).join('.');
    const fileContent = await handle.getFile().then((file) => file.text());

    const sqlScriptId = uuidv4() as SQLScriptId;
    const sqlScript: SQLScript = {
      id: sqlScriptId,
      name: nameWithoutExt,
      content: fileContent,
    };

    newScripts.push([sqlScriptId, sqlScript]);
  }

  // Create an object to pass to store update
  const newState: {
    sqlScripts: Map<SQLScriptId, SQLScript>;
  } = {
    sqlScripts: new Map(Array.from(sqlScripts).concat(newScripts)),
  };

  // Update the store
  useInitStore.setState(newState, undefined, 'AppStore/importSQLFiles');

  // If we have an IndexedDB connection, persist the new SQL scripts
  if (iDbConn) {
    for (const [id, script] of newScripts) {
      iDbConn.put(SQL_SCRIPT_TABLE_NAME, script, id);
    }
  }
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
  tab: AnyTab,
  newTabOrder: TabId[],
) => {
  const tx = iDb.transaction([TAB_TABLE_NAME, CONTENT_VIEW_TABLE_NAME], 'readwrite');
  await tx.objectStore(TAB_TABLE_NAME).put(tab, tab.id);
  await tx.objectStore(CONTENT_VIEW_TABLE_NAME).put(newTabOrder, 'tabOrder');

  await tx.done;
};

function ensureDataView(
  dataViewOrId: PersistentDataViewData | PersistentDataViewId,
  dataViews: Map<PersistentDataViewId, PersistentDataViewData>,
): PersistentDataViewData {
  if (typeof dataViewOrId === 'string') {
    const fromState = dataViews.get(dataViewOrId);

    if (!fromState) {
      throw new Error(`Data view with id ${dataViewOrId} not found`);
    }

    return fromState;
  }

  return dataViewOrId;
}

const findTabFromDataViewImpl = (
  tabs: Map<TabId, AnyTab>,
  dataViewId: PersistentDataViewId,
): FileDataSourceTab | undefined =>
  Array.from(tabs.values())
    .filter((tab) => tab.type === 'data-source')
    .find((tab) => tab.dataViewId === dataViewId);

/**
 * Finds a tab displaying an existing data view or undefined.
 *
 * @param dataViewOrId - The ID or a DataView object to find the tab for.
 * @returns A new Tab object if found.
 * @throws An error if the DataView with the given ID does not exist.
 */
export const findTabFromDataView = (
  dataViewOrId: PersistentDataViewData | PersistentDataViewId,
): FileDataSourceTab | undefined => {
  const state = useInitStore.getState();

  // Get the data source object if not passed as an object
  const dataView = ensureDataView(dataViewOrId, state.dataViews);

  // Check if the script already has an associated tab
  return findTabFromDataViewImpl(state.tabs, dataView.id);
};

function ensureScript(
  sqlScriptOrId: SQLScript | SQLScriptId,
  sqlScripts: Map<SQLScriptId, SQLScript>,
): SQLScript {
  // Get the script object if not passed as an object
  if (typeof sqlScriptOrId === 'string') {
    const fromState = sqlScripts.get(sqlScriptOrId);

    if (!fromState) {
      throw new Error(`SQL script with id ${sqlScriptOrId} not found`);
    }

    return fromState;
  }

  return sqlScriptOrId;
}

const findTabFromScriptImpl = (
  tabs: Map<TabId, AnyTab>,
  sqlScriptId: SQLScriptId,
): ScriptTab | undefined =>
  Array.from(tabs.values())
    .filter((tab) => tab.type === 'script')
    .find((tab) => tab.sqlScriptId === sqlScriptId);

/**
 * Finds a tab displaying an existing SQL script or undefined.
 *
 * @param sqlScriptOrId - The ID or a SQL script object to find the tab for.
 * @returns A new Tab object if found.
 * @throws An error if the SQL script with the given ID does not exist.
 */
export const findTabFromScript = (
  sqlScriptOrId: SQLScript | SQLScriptId,
): ScriptTab | undefined => {
  const state = useInitStore.getState();

  // Get the script object if not passed as an object
  const sqlScript: SQLScript = ensureScript(sqlScriptOrId, state.sqlScripts);

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
export const getOrCreateTabFromScript = (sqlScriptOrId: SQLScript | SQLScriptId): ScriptTab => {
  const state = useInitStore.getState();

  // Get the script object if not passed as an object
  const sqlScript: SQLScript = ensureScript(sqlScriptOrId, state.sqlScripts);

  // Check if the script already has an associated tab
  const existingTab = findTabFromScriptImpl(state.tabs, sqlScript.id);

  // No need to create a new tab if one already exists
  if (existingTab) {
    return existingTab;
  }

  // Create a new tab
  const tabId = uuidv4() as TabId;
  const tab: ScriptTab = {
    type: 'script',
    id: tabId,
    meta: { name: sqlScript.name, iconType: 'code-file' },
    sqlScriptId: sqlScript.id,

    layout: {
      tableColumnWidth: {},
      dataViewPaneHeight: 0,
    },
    editorPaneHeight: 0,
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

/**
 * Creates a new tab from an existing persistent data view.
 * If the view is already associated with a tab, it returns that tab without creating a new one.
 *
 * @param dataViewId - The ID of an object to create a tab from.
 * @returns A new Tab object.
 * @throws An error if the SQL script with the given ID does not exist.
 */
export const getOrCreateTabFromPersistentDataView = (
  dataViewId: PersistentDataViewId,
): FileDataSourceTab => {
  const state = useInitStore.getState();

  // Get the script object if not passed as an object
  const dataView = ensureDataView(dataViewId, state.dataViews);

  // Check if the script already has an associated tab
  const existingTab = findTabFromDataViewImpl(state.tabs, dataViewId);

  // No need to create a new tab if one already exists
  if (existingTab) {
    return existingTab;
  }

  // Create a new tab
  const tabId = uuidv4() as TabId;
  const tab: FileDataSourceTab = {
    type: 'data-source',
    id: tabId,
    // TODO proper iconType or move it to the data view model
    meta: { name: dataView.displayName, iconType: 'csv' },
    dataViewId: dataView.id,

    layout: {
      tableColumnWidth: {},
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
    'AppStore/createTabFromPersistentDataView',
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
  tabs: Map<TabId, AnyTab>,
  tabOrder: TabId[],
  activeTabId: TabId | null,
  previewTabId: TabId | null,
): {
  newTabs: Map<TabId, AnyTab>;
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
