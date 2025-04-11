import { create } from 'zustand';
import { shallow } from 'zustand/shallow';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { v4 as uuidv4 } from 'uuid';
import { findUniqueName } from '@utils/helpers';
import {
  AnyTab,
  AttachedDBDataTab,
  DataViewLayout,
  FileDataSourceTab,
  ScriptTab,
  TabId,
} from '@models/tab';
import { IDBPDatabase } from 'idb';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { ContentViewState } from '@models/content-view';
import {
  AnyDataSource,
  AnyFlatFileDataSource,
  AttachedDB,
  PersistentDataSourceId,
} from '@models/data-source';
import { LocalEntry, LocalEntryId } from '@models/file-system';
import { localEntryFromHandle } from '@utils/file-system';

import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import {
  registerAndAttachDatabase,
  registerFileSourceAndCreateView,
} from '@controllers/db/file-handle';
import { getTabIcon, getTabName } from '@utils/navigation';
import { IconType } from '@features/list-view-icon';
import { addAttachedDB, addFlatFileDataSource } from '@utils/data-source';
import { getAttachedDBs, getViews } from '@controllers/db/duckdb-meta';
import { DataBaseModel } from '@models/db';
import { DataViewCacheItem, DataViewCacheKey } from '@models/data-adapter';
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
   * The current state of the app, indicating whether it is loading, ready, or has encountered an error.
   */
  appLoadState: AppLoadState;

  /**
   * A mapping of persistent data source ids to their corresponding objects.
   */
  dataSources: Map<PersistentDataSourceId, AnyDataSource>;

  /**
   * A mapping of local entry identifiers to their corresponding LocalEntry objects.
   */
  localEntries: Map<LocalEntryId, LocalEntry>;

  /**
   * A mapping of SQL script identifiers to their corresponding SQLScript objects.
   */
  sqlScripts: Map<SQLScriptId, SQLScript>;

  /**
   * A persitent cache of data for data views.
   */
  dataViewCache: Map<DataViewCacheKey, DataViewCacheItem>;

  /**
   * A mapping of tab identifiers to their corresponding Tab objects.
   */
  tabs: Map<TabId, AnyTab>;

  /**
   * A mapping of attached database names (including memory) to their corresponding
   * DataBaseModel objects with metadata.
   *
   * This is not persisted in the IndexedDB and instead recreated on app load and
   * then kept in sync with the database.
   */
  dataBaseMetadata: Map<string, DataBaseModel>;
} & ContentViewState;

const initialState: AppStore = {
  _iDbConn: null,
  appLoadState: 'init',
  dataSources: new Map(),
  localEntries: new Map(),
  sqlScripts: new Map(),
  dataViewCache: new Map(),
  tabs: new Map(),
  dataBaseMetadata: new Map(),
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

export function useDataSourceIdForActiveTab(): PersistentDataSourceId | null {
  return useInitStore((state) => {
    if (!state.activeTabId) return null;

    const tab = state.tabs.get(state.activeTabId);
    if (!tab) return null;
    if (tab.type !== 'data-source' || tab.dataSourceType !== 'file') {
      return null;
    }

    return tab.dataSourceId;
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

export function useTabIconMap(): Map<TabId, IconType> {
  return useInitStore(
    useShallow(
      (state) =>
        new Map(
          Array.from(state.tabs).map(([id, tab]): [TabId, IconType] => [
            id,
            getTabIcon(tab, state.dataSources),
          ]),
        ),
    ),
  );
}

export function useTabNameMap(): Map<TabId, string> {
  return useInitStore(
    useShallow(
      (state) =>
        new Map(
          Array.from(state.tabs).map(([id, tab]): [TabId, string] => [
            id,
            getTabName(tab, state.sqlScripts, state.dataSources, state.localEntries),
          ]),
        ),
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
  newDataSources: [PersistentDataSourceId, AnyDataSource][],
) => {
  const tx = iDb.transaction([LOCAL_ENTRY_TABLE_NAME, DATA_SOURCE_TABLE_NAME], 'readwrite');

  // Add new local entries
  for (const [id, newLocalEntry] of newEntries) {
    await tx.objectStore(LOCAL_ENTRY_TABLE_NAME).put(newLocalEntry, id);
  }

  // Add new data sources
  for (const [id, newDataSource] of newDataSources) {
    await tx.objectStore(DATA_SOURCE_TABLE_NAME).put(newDataSource, id);
  }

  // Commit the transaction
  await tx.done;
};

export const addLocalFileOrFolders = async (
  db: AsyncDuckDB,
  conn: AsyncDuckDBConnection,
  handles: (FileSystemDirectoryHandle | FileSystemFileHandle)[],
): Promise<{
  skippedExistingEntries: LocalEntry[];
  skippedUnsupportedFiles: string[];
  newEntries: [LocalEntryId, LocalEntry][];
  newDataSources: [PersistentDataSourceId, AnyDataSource][];
}> => {
  const { _iDbConn: iDbConn, localEntries, dataSources } = useInitStore.getState();

  const usedEntryNames = new Set(
    localEntries
      .values()
      // For files we use uniqueAlias, but folders we use the file name without alias
      .map((entry) => (entry.kind === 'file' ? entry.uniqueAlias : entry.name)),
  );

  // Fetch currently attached databases, to avoid name collisions
  const reservedDbs = new Set((await getAttachedDBs(conn, false)) || ['memory']);
  // Same for views
  const reservedViews = new Set((await getViews(conn, 'memory', 'main')) || ['memory']);

  const skippedExistingEntries: LocalEntry[] = [];
  const skippedUnsupportedFiles: string[] = [];
  const newEntries: [LocalEntryId, LocalEntry][] = [];
  const newDataSources: [PersistentDataSourceId, AnyDataSource][] = [];

  for (const handle of handles) {
    const localEntry = localEntryFromHandle(handle, null, true, (fileName: string): string =>
      findUniqueName(fileName, (name: string) => usedEntryNames.has(name)),
    );

    if (!localEntry) {
      // Unsupported file type. Nothing to add to store.
      skippedUnsupportedFiles.push(handle.name);
      continue;
    }

    let alreadyExists = false;

    // Check if the entry already exists in the store
    // TODO: this is a "stupid" check in a sense that it is not handling
    // when a folder is being added that brings in a previously esiting file.
    // The full proper reocnciliation is not implemented yet.
    for (const entry of localEntries.values()) {
      if (await entry.handle.isSameEntry(localEntry.handle)) {
        skippedExistingEntries.push(localEntry);
        alreadyExists = true;
        break;
      }
    }

    // Entry already exists, skip adding it
    if (alreadyExists) {
      continue;
    }

    // New entry, remember it's unique alias and add it to the store
    usedEntryNames.add(localEntry.kind === 'file' ? localEntry.uniqueAlias : localEntry.name);
    newEntries.push([localEntry.id, localEntry]);

    // Check if this is a data source file ad create a data source if so
    if (localEntry.kind === 'directory') {
      throw new Error('TODO');
    } else if (localEntry.fileType === 'data-source') {
      switch (localEntry.ext) {
        case 'duckdb': {
          const dbSource = addAttachedDB(localEntry, reservedDbs);

          // Assume it will be added, so reserve the name
          reservedDbs.add(dbSource.dbName);

          // TODO: currently we assume this works, add proper error handling
          await registerAndAttachDatabase(
            db,
            conn,
            localEntry.handle,
            `${localEntry.uniqueAlias}.${localEntry.ext}`,
            dbSource.dbName,
          );

          newDataSources.push([dbSource.id, dbSource]);

          break;
        }
        default: {
          // First create a data view object
          const dataSource = addFlatFileDataSource(localEntry, reservedViews);

          // Add to reserved views
          reservedViews.add(dataSource.viewName);

          // Then register the file source and create the view.
          // TODO: this may potentially fail - we should handle this case
          await registerFileSourceAndCreateView(
            db,
            conn,
            localEntry.handle,
            `${localEntry.uniqueAlias}.${localEntry.ext}`,
            dataSource.viewName,
          );

          newDataSources.push([dataSource.id, dataSource]);
          break;
        }
      }
    }
  }

  // Create an object to pass to store update
  const newState: {
    localEntries: Map<LocalEntryId, LocalEntry>;
    dataSources?: Map<PersistentDataSourceId, AnyDataSource>;
  } = {
    localEntries: new Map(Array.from(localEntries).concat(newEntries)),
  };

  if (newDataSources.length > 0) {
    newState.dataSources = new Map(Array.from(dataSources).concat(newDataSources));
  }

  // Update the store
  useInitStore.setState(newState, undefined, 'AppStore/addLocalFileOrFolders');

  // If we have an IndexedDB connection, persist the new local entry
  if (iDbConn) {
    persistAddLocalEntry(iDbConn, newEntries, newDataSources);
  }

  // Return the new local entry and data source
  return {
    skippedExistingEntries,
    skippedUnsupportedFiles,
    newEntries,
    newDataSources,
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

export const renameSQLScript = (sqlScriptOrId: SQLScript | SQLScriptId, newName: string): void => {
  const { sqlScripts } = useInitStore.getState();

  // Check if the script exists
  const sqlScript = ensureScript(sqlScriptOrId, sqlScripts);

  // Make sure the name is unique among other scripts
  const allNames = new Set(
    Array.from(sqlScripts.values())
      .filter((script) => script.id !== sqlScript.id)
      .map((script) => script.name),
  );

  const uniqueName = findUniqueName(newName, (value) => allNames.has(value));

  // Create updated script
  const updatedScript: SQLScript = {
    ...sqlScript,
    name: uniqueName,
  };

  // Update the store
  const newSqlScripts = new Map(sqlScripts);
  newSqlScripts.set(sqlScript.id, updatedScript);

  // Update the store with changes
  useInitStore.setState(
    {
      sqlScripts: newSqlScripts,
    },
    undefined,
    'AppStore/renameSQLScript',
  );

  // Persist the changes to IndexedDB
  const iDb = useInitStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(SQL_SCRIPT_TABLE_NAME, updatedScript, sqlScript.id);
  }
};

export const updateSQLScriptContent = (
  sqlScriptOrId: SQLScript | SQLScriptId,
  newContent: string,
): void => {
  const { sqlScripts } = useInitStore.getState();

  // Check if the script exists
  const sqlScript = ensureScript(sqlScriptOrId, sqlScripts);

  // Create updated script
  const updatedScript: SQLScript = {
    ...sqlScript,
    content: newContent,
  };

  // Update the store
  const newSqlScripts = new Map(sqlScripts);
  newSqlScripts.set(sqlScript.id, updatedScript);

  // Update the store with changes
  useInitStore.setState(
    {
      sqlScripts: newSqlScripts,
    },
    undefined,
    'AppStore/updateSQLScriptContent',
  );

  // Persist the changes to IndexedDB
  const iDb = useInitStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(SQL_SCRIPT_TABLE_NAME, updatedScript, sqlScript.id);
  }
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
  activeTabId: TabId | null,
) => {
  const tx = iDb.transaction([TAB_TABLE_NAME, CONTENT_VIEW_TABLE_NAME], 'readwrite');
  await tx.objectStore(TAB_TABLE_NAME).put(tab, tab.id);
  await tx.objectStore(CONTENT_VIEW_TABLE_NAME).put(newTabOrder, 'tabOrder');
  await tx.objectStore(CONTENT_VIEW_TABLE_NAME).put(activeTabId, 'activeTabId');

  await tx.done;
};

function ensureFlatFileDataSource(
  dataSourceOrId: AnyFlatFileDataSource | PersistentDataSourceId,
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
): AnyFlatFileDataSource {
  let obj: AnyDataSource;

  if (typeof dataSourceOrId === 'string') {
    const fromState = dataSources.get(dataSourceOrId);

    if (!fromState) {
      throw new Error(`Data source with id ${dataSourceOrId} not found`);
    }

    obj = fromState;
  } else {
    obj = dataSourceOrId;
  }

  if (obj.type === 'attached-db') {
    throw new Error(`Data source with id ${obj.id} is not a flat file data source`);
  }

  return obj;
}

const findTabFromFlatFileDataSourceImpl = (
  tabs: Map<TabId, AnyTab>,
  dataSource: AnyFlatFileDataSource,
): FileDataSourceTab | undefined =>
  Array.from(tabs.values())
    .filter((tab) => tab.type === 'data-source' && tab.dataSourceType === 'file')
    .find((tab) => tab.dataSourceId === dataSource.id);

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
 * Gets existing or creates a new tab from an existing SQL script.
 * If the SQL script is already associated with a tab, it returns that tab without creating a new one.
 *
 * @param sqlScriptOrId - The ID or a SQL script object to create a tab from.
 * @param setActive - Whether to set the new tab as active. This is a shortcut for
 *                  calling `setActiveTabId(tab.id)` on the returned tab.
 * @returns A new Tab object.
 * @throws An error if the SQL script with the given ID does not exist.
 */
export const getOrCreateTabFromScript = (
  sqlScriptOrId: SQLScript | SQLScriptId,
  setActive: boolean = false,
): ScriptTab => {
  const state = useInitStore.getState();

  // Get the script object if not passed as an object
  const sqlScript: SQLScript = ensureScript(sqlScriptOrId, state.sqlScripts);

  // Check if the script already has an associated tab
  const existingTab = findTabFromScriptImpl(state.tabs, sqlScript.id);

  // No need to create a new tab if one already exists
  if (existingTab) {
    // Since we didn't change any state, we can reuse existing action directly
    if (setActive) {
      setActiveTabId(existingTab.id);
    }

    return existingTab;
  }

  // Create a new tab
  const tabId = uuidv4() as TabId;
  const tab: ScriptTab = {
    type: 'script',
    id: tabId,
    sqlScriptId: sqlScript.id,
    dataViewLayout: {
      tableColumnWidth: {},
      dataViewPaneHeight: 0,
    },
    editorPaneHeight: 0,
  };

  // Add the new tab to the store
  const newTabs = new Map(state.tabs).set(tabId, tab);
  const newTabOrder = [...state.tabOrder, tabId];
  const newActiveTabId = setActive ? tabId : state.activeTabId;

  useInitStore.setState(
    (_) => ({
      activeTabId: newActiveTabId,
      tabs: newTabs,
      tabOrder: newTabOrder,
    }),
    undefined,
    'AppStore/createTabFromScript',
  );

  // Persist the new tab to IndexedDB
  const iDb = state._iDbConn;
  if (iDb) {
    persistCreateTab(iDb, tab, newTabOrder, newActiveTabId);
  }

  return tab;
};

/**
 * Finds an existing tab for a given flat file data source.
 *
 * @param dataSourceOrId - The flat file data source object or its ID to find the tab for
 * @returns The tab associated with the data source if found, otherwise undefined
 * @throws {Error} If the data source with the given ID does not exist or is not a flat file data source
 */
export const findTabFromFlatFileDataSource = (
  dataSourceOrId: AnyFlatFileDataSource | PersistentDataSourceId,
) => {
  const state = useInitStore.getState();
  const dataSource = ensureFlatFileDataSource(dataSourceOrId, state.dataSources);
  return findTabFromFlatFileDataSourceImpl(state.tabs, dataSource);
};

/**
 * Gets existing or creates a new tab from an existing flat file data source.
 * If the source is already associated with a tab, it returns that tab without creating a new one.
 *
 * @param dataSourceOrId - The object or its ID to create a tab from.
 * @param setActive - Whether to set the new tab as active. This is a shortcut for
 *                  calling `setActiveTabId(tab.id)` on the returned tab.
 * @returns A new Tab object.
 * @throws An error if the SQL script with the given ID does not exist.
 */
export const getOrCreateTabFromFlatFileDataSource = (
  dataSourceOrId: AnyFlatFileDataSource | PersistentDataSourceId,
  setActive: boolean = false,
): FileDataSourceTab => {
  const state = useInitStore.getState();

  // Get the script object if not passed as an object
  const dataSource = ensureFlatFileDataSource(dataSourceOrId, state.dataSources);

  // Check if the script already has an associated tab
  const existingTab = findTabFromFlatFileDataSourceImpl(state.tabs, dataSource);

  // No need to create a new tab if one already exists
  if (existingTab) {
    // Since we didn't change any state, we can reuse existing action directly
    if (setActive) {
      setActiveTabId(existingTab.id);
    }
    return existingTab;
  }

  // Create a new tab
  const tabId = uuidv4() as TabId;
  const tab: FileDataSourceTab = {
    type: 'data-source',
    dataSourceType: 'file',
    id: tabId,
    dataSourceId: dataSource.id,

    dataViewLayout: {
      tableColumnWidth: {},
      dataViewPaneHeight: 0,
    },
  };

  // Add the new tab to the store
  const newTabs = new Map(state.tabs).set(tabId, tab);
  const newTabOrder = [...state.tabOrder, tabId];
  const newActiveTabId = setActive ? tabId : state.activeTabId;

  useInitStore.setState(
    (_) => ({
      activeTabId: newActiveTabId,
      tabs: newTabs,
      tabOrder: newTabOrder,
    }),
    undefined,
    'AppStore/createTabFromPersistentDataView',
  );

  // Persist the new tab to IndexedDB
  const iDb = state._iDbConn;
  if (iDb) {
    persistCreateTab(iDb, tab, newTabOrder, newActiveTabId);
  }

  return tab;
};

/**
 * Gets existing or creates a new tab for a given table/view in an attached database.
 * If the source is already associated with a tab, it returns that tab without creating a new one.
 *
 * @param dataSource - The ID of an object to create a tab from.
 * @param schemaName - The name of the schema.
 * @param objectName - The name of the table or view.
 * @param objectType - The type of the object, either 'table' or 'view'.
 * @param setActive - Whether to set the new tab as active. This is a shortcut for
 *                  calling `setActiveTabId(tab.id)` on the returned tab.
 * @returns A new Tab object.
 * @throws An error if the SQL script with the given ID does not exist.
 */
export const getOrCreateTabFromAttachedDBObject = (
  dataSource: AttachedDB,
  schemaName: string,
  objectName: string,
  objectType: 'table' | 'view',
  setActive: boolean = false,
): AttachedDBDataTab => {
  const state = useInitStore.getState();

  // Check if the script already has an associated tab
  const existingTab = Array.from(state.tabs.values())
    .filter((tab) => tab.type === 'data-source' && tab.dataSourceType === 'db')
    .find(
      (tab) =>
        tab.dataSourceId === dataSource.id &&
        tab.schemaName === schemaName &&
        tab.objectName === objectName,
    );

  // No need to create a new tab if one already exists
  if (existingTab) {
    // Since we didn't change any state, we can reuse existing action directly
    if (setActive) {
      setActiveTabId(existingTab.id);
    }
    return existingTab;
  }

  // Create a new tab
  const tabId = uuidv4() as TabId;
  const tab: AttachedDBDataTab = {
    type: 'data-source',
    dataSourceType: 'db',
    id: tabId,
    dataSourceId: dataSource.id,
    schemaName,
    objectName,
    dbType: objectType,

    dataViewLayout: {
      tableColumnWidth: {},
      dataViewPaneHeight: 0,
    },
  };

  // Add the new tab to the store
  const newTabs = new Map(state.tabs).set(tabId, tab);
  const newTabOrder = [...state.tabOrder, tabId];
  const newActiveTabId = setActive ? tabId : state.activeTabId;

  useInitStore.setState(
    (_) => ({
      activeTabId: newActiveTabId,
      tabs: newTabs,
      tabOrder: newTabOrder,
    }),
    undefined,
    'AppStore/createTabFromPersistentDataView',
  );

  // Persist the new tab to IndexedDB
  const iDb = state._iDbConn;
  if (iDb) {
    persistCreateTab(iDb, tab, newTabOrder, newActiveTabId);
  }

  return tab;
};

function ensureTab(tabOrId: AnyTab | TabId, tabs: Map<TabId, AnyTab>): AnyTab {
  // Get the tab object if not passed as an object
  if (typeof tabOrId === 'string') {
    const fromState = tabs.get(tabOrId);

    if (!fromState) {
      throw new Error(`Tab with id ${tabOrId} not found`);
    }

    return fromState;
  }

  return tabOrId;
}

const persistDeleteTab = async (
  iDb: IDBPDatabase<AppIdbSchema>,
  deletedTabIds: TabId | TabId[],
  newActiveTabId: TabId | null,
  newPreviewTabId: TabId | null,
  newTabOrder: TabId[],
) => {
  const tx = iDb.transaction([TAB_TABLE_NAME, CONTENT_VIEW_TABLE_NAME], 'readwrite');

  // Handle single tab ID or array of tab IDs
  const tabsToDelete = Array.isArray(deletedTabIds) ? deletedTabIds : [deletedTabIds];

  // Delete each tab
  for (const tabId of tabsToDelete) {
    await tx.objectStore(TAB_TABLE_NAME).delete(tabId);
  }

  const contentViewStore = tx.objectStore(CONTENT_VIEW_TABLE_NAME);
  await contentViewStore.put(newTabOrder, 'tabOrder');
  await contentViewStore.put(newActiveTabId, 'activeTabId');
  await contentViewStore.put(newPreviewTabId, 'previewTabId');

  await tx.done;
};

const persistDeleteDataSource = async (
  iDb: IDBPDatabase<AppIdbSchema>,
  deletedDataSourceIds: PersistentDataSourceId | PersistentDataSourceId[],
) => {
  const tx = iDb.transaction(DATA_SOURCE_TABLE_NAME, 'readwrite');

  // Handle single data source ID or array of data source IDs
  const dataSourcesToDelete = Array.isArray(deletedDataSourceIds)
    ? deletedDataSourceIds
    : [deletedDataSourceIds];

  // Delete each data source
  for (const id of dataSourcesToDelete) {
    await tx.objectStore(DATA_SOURCE_TABLE_NAME).delete(id);
  }

  await tx.done;
};

/**
 * Deletes a tab associated with the specified SQL script ID.
 *
 * @param sqlScriptId - The ID of the SQL script whose tab should be deleted
 * @returns true if a tab was found and deleted, false otherwise
 */
export const deleteTabByScriptId = (sqlScriptId: SQLScriptId): boolean => {
  const { tabs } = useInitStore.getState();

  // Find the tab associated with this script
  const tab = findTabFromScriptImpl(tabs, sqlScriptId);

  if (tab) {
    // Delete the found tab
    deleteTab(tab.id);
    return true;
  }

  return false;
};

/**
 * Deletes a tab associated with the specified data source ID.
 * This works for both flat file data sources and database objects.
 *
 * @param dataSourceId - The ID of the data source whose tab(s) should be deleted
 * @returns true if at least one tab was found and deleted, false otherwise
 */
export const deleteTabByDataSourceId = (dataSourceId: PersistentDataSourceId): boolean => {
  const { tabs } = useInitStore.getState();

  // Find all tabs associated with this data source ID
  const tabsToDelete = Array.from(tabs.values())
    .filter((tab) => tab.type === 'data-source' && tab.dataSourceId === dataSourceId)
    .map((tab) => tab.id);

  if (tabsToDelete.length > 0) {
    // Delete all found tabs
    deleteTab(tabsToDelete);
    return true;
  }

  return false;
};

const deleteTabImpl = (
  deleteTabIds: TabId | TabId[],
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
  const idsToDelete = Array.isArray(deleteTabIds) ? deleteTabIds : [deleteTabIds];

  const deleteSet = new Set(idsToDelete);

  const newTabs = new Map(Array.from(tabs).filter(([id, _]) => !deleteSet.has(id)));
  const newTabOrder = tabOrder.filter((id) => !deleteSet.has(id));

  let newActiveTabId = activeTabId;
  if (activeTabId !== null && deleteSet.has(activeTabId)) {
    // Find the index of the first tab being deleted in the original order
    const firstDeletedIndex = Math.min(
      ...idsToDelete
        .map((id) => tabOrder.findIndex((tabId) => tabId === id))
        .filter((idx) => idx !== -1),
    );

    // Try to activate the tab before the first deleted tab
    const prevTabIndex = firstDeletedIndex - 1;
    newActiveTabId = prevTabIndex >= 0 ? tabOrder[prevTabIndex] : null;

    // If we couldn't find a previous tab, try the first remaining tab
    if (newActiveTabId === null && newTabOrder.length > 0) {
      const [firstTab] = newTabOrder;
      newActiveTabId = firstTab;
    }
  }

  // Handle preview tab deletion
  const newPreviewTabId =
    previewTabId !== null && deleteSet.has(previewTabId) ? null : previewTabId;

  return {
    newTabs,
    newTabOrder,
    newActiveTabId,
    newPreviewTabId,
  };
};

export const deleteTab = (tabId: TabId | TabId[]) => {
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
    // Now we can pass the entire array (or single ID) directly
    persistDeleteTab(iDbConn, tabId, newActiveTabId, newPreviewTabId, newTabOrder);
  }
};

/**
 * Implementation of data source deletion that only removes the data sources from the map
 * without affecting any related data.
 *
 * @param deleteDataSourceIds - ID or array of IDs of data sources to delete
 * @param dataSources - Current data sources map
 * @returns New data sources map with specified data sources removed
 */
const deleteDataSourceImpl = (
  deleteDataSourceIds: PersistentDataSourceId | PersistentDataSourceId[],
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
): Map<PersistentDataSourceId, AnyDataSource> => {
  const idsToDelete = Array.isArray(deleteDataSourceIds)
    ? deleteDataSourceIds
    : [deleteDataSourceIds];
  const deleteSet = new Set(idsToDelete);

  return new Map(Array.from(dataSources).filter(([id, _]) => !deleteSet.has(id)));
};

/**
 * Deletes one or more data sources from the store and persists the change.
 * This also deletes any tabs that are associated with the data sources being deleted.
 *
 * @param dataSourceId - ID or array of IDs of data sources to delete
 */
export const deleteDataSource = (
  dataSourceId: PersistentDataSourceId | PersistentDataSourceId[],
) => {
  const {
    dataSources,
    tabs,
    tabOrder,
    activeTabId,
    previewTabId,
    _iDbConn: iDbConn,
  } = useInitStore.getState();

  const dataSourceIdsArray = Array.isArray(dataSourceId) ? dataSourceId : [dataSourceId];
  const dataSourceIdsToDelete = new Set(dataSourceIdsArray);

  const newDataSources = deleteDataSourceImpl(dataSourceIdsArray, dataSources);

  const tabsToDelete: TabId[] = [];

  for (const [tabId, tab] of tabs.entries()) {
    if (tab.type === 'data-source') {
      if (dataSourceIdsToDelete.has(tab.dataSourceId as PersistentDataSourceId)) {
        tabsToDelete.push(tabId);
      }
    }
  }

  let newTabs = tabs;
  let newTabOrder = tabOrder;
  let newActiveTabId = activeTabId;
  let newPreviewTabId = previewTabId;

  if (tabsToDelete.length > 0) {
    const result = deleteTabImpl(tabsToDelete, tabs, tabOrder, activeTabId, previewTabId);

    newTabs = result.newTabs;
    newTabOrder = result.newTabOrder;
    newActiveTabId = result.newActiveTabId;
    newPreviewTabId = result.newPreviewTabId;
  }

  useInitStore.setState(
    {
      dataSources: newDataSources,
      tabs: newTabs,
      tabOrder: newTabOrder,
      activeTabId: newActiveTabId,
      previewTabId: newPreviewTabId,
    },
    undefined,
    'AppStore/deleteDataSource',
  );

  if (iDbConn) {
    // Delete data sources from IndexedDB
    persistDeleteDataSource(iDbConn, dataSourceIdsArray);

    // Delete associated tabs from IndexedDB if any
    if (tabsToDelete.length) {
      persistDeleteTab(iDbConn, tabsToDelete, newActiveTabId, newPreviewTabId, newTabOrder);
    }
  }
};

/**
 * Implementation of SQL script deletion that only removes the scripts from the map
 * without affecting any related data.
 *
 * @param deleteSqlScriptIds - ID or array of IDs of SQL scripts to delete
 * @param sqlScripts - Current SQL scripts map
 * @returns New SQL scripts map with specified scripts removed
 */
const deleteSqlScriptImpl = (
  deleteSqlScriptIds: SQLScriptId | SQLScriptId[],
  sqlScripts: Map<SQLScriptId, SQLScript>,
): Map<SQLScriptId, SQLScript> => {
  const idsToDelete = Array.isArray(deleteSqlScriptIds) ? deleteSqlScriptIds : [deleteSqlScriptIds];
  const deleteSet = new Set(idsToDelete);

  return new Map(Array.from(sqlScripts).filter(([id, _]) => !deleteSet.has(id)));
};

const persistDeleteSqlScript = async (
  iDb: IDBPDatabase<AppIdbSchema>,
  deletedSqlScriptIds: SQLScriptId | SQLScriptId[],
) => {
  const tx = iDb.transaction(SQL_SCRIPT_TABLE_NAME, 'readwrite');

  // Handle single SQL script ID or array of SQL script IDs
  const sqlScriptsToDelete = Array.isArray(deletedSqlScriptIds)
    ? deletedSqlScriptIds
    : [deletedSqlScriptIds];

  // Delete each SQL script
  for (const id of sqlScriptsToDelete) {
    await tx.objectStore(SQL_SCRIPT_TABLE_NAME).delete(id);
  }

  await tx.done;
};

/**
 * Deletes one or more SQL scripts from the store and persists the change.
 * This also deletes any tabs that are associated with the SQL scripts being deleted.
 *
 * @param sqlScriptId - ID or array of IDs of SQL scripts to delete
 */
export const deleteSqlScript = (sqlScriptId: SQLScriptId | SQLScriptId[]) => {
  const {
    sqlScripts,
    tabs,
    tabOrder,
    activeTabId,
    previewTabId,
    _iDbConn: iDbConn,
  } = useInitStore.getState();

  const sqlScriptIdsArray = Array.isArray(sqlScriptId) ? sqlScriptId : [sqlScriptId];
  const sqlScriptIdsToDelete = new Set(sqlScriptIdsArray);

  const newSqlScripts = deleteSqlScriptImpl(sqlScriptIdsArray, sqlScripts);

  const tabsToDelete: TabId[] = [];

  for (const [tabId, tab] of tabs.entries()) {
    if (tab.type === 'script') {
      if (sqlScriptIdsToDelete.has(tab.sqlScriptId)) {
        tabsToDelete.push(tabId);
      }
    }
  }

  let newTabs = tabs;
  let newTabOrder = tabOrder;
  let newActiveTabId = activeTabId;
  let newPreviewTabId = previewTabId;

  if (tabsToDelete.length > 0) {
    const result = deleteTabImpl(tabsToDelete, tabs, tabOrder, activeTabId, previewTabId);

    newTabs = result.newTabs;
    newTabOrder = result.newTabOrder;
    newActiveTabId = result.newActiveTabId;
    newPreviewTabId = result.newPreviewTabId;
  }

  useInitStore.setState(
    {
      sqlScripts: newSqlScripts,
      tabs: newTabs,
      tabOrder: newTabOrder,
      activeTabId: newActiveTabId,
      previewTabId: newPreviewTabId,
    },
    undefined,
    'AppStore/deleteSqlScript',
  );

  if (iDbConn) {
    // Delete SQL scripts from IndexedDB
    persistDeleteSqlScript(iDbConn, sqlScriptIdsArray);

    // Delete associated tabs from IndexedDB if any
    if (tabsToDelete.length) {
      persistDeleteTab(iDbConn, tabsToDelete, newActiveTabId, newPreviewTabId, newTabOrder);
    }
  }
};

export const updateTabDataViewLayout = (
  tabOrId: AnyTab | TabId,
  newLayout: DataViewLayout,
): void => {
  const { tabs } = useInitStore.getState();

  // Get the tab object if not passed as an object
  const tab = ensureTab(tabOrId, tabs);

  // Check for changes
  if (
    tab.dataViewLayout.dataViewPaneHeight === newLayout.dataViewPaneHeight &&
    shallow(tab.dataViewLayout.tableColumnWidth, newLayout.tableColumnWidth)
  ) {
    // No changes, nothing to do
    return;
  }

  // Create new tab object with updated layout
  const updatedTab: AnyTab = {
    ...tab,
    dataViewLayout: newLayout,
  };

  // Update the store
  const newTabs = new Map(tabs);
  newTabs.set(tab.id, updatedTab);

  // Update the store with changes
  useInitStore.setState(
    {
      tabs: newTabs,
    },
    undefined,
    'AppStore/updateTabDataViewLayout',
  );

  // Persist the changes to IndexedDB
  const iDb = useInitStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, tab.id);
  }
};

export const updateScriptTabEditorPaneHeight = (tab: ScriptTab, newPaneHeight: number): void => {
  const { tabs } = useInitStore.getState();

  // Check for changes
  if (tab.editorPaneHeight === newPaneHeight) {
    // No changes, nothing to do
    return;
  }

  // Create new tab object with updated layout
  const updatedTab: ScriptTab = {
    ...tab,
    editorPaneHeight: newPaneHeight,
  };

  // Update the store
  const newTabs = new Map(tabs);
  newTabs.set(tab.id, updatedTab);

  // Update the store with changes
  useInitStore.setState(
    {
      tabs: newTabs,
    },
    undefined,
    'AppStore/updateScriptTabEditorPaneHeight',
  );

  // Persist the changes to IndexedDB
  const iDb = useInitStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, tab.id);
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
