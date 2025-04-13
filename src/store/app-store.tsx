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
import { LocalEntry, LocalEntryId, LocalFile } from '@models/file-system';
import { localEntryFromHandle } from '@utils/file-system';

import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import {
  detachAndUnregisterDatabase,
  dropViewAndUnregisterFile,
  registerAndAttachDatabase,
  registerFileSourceAndCreateView,
} from '@controllers/db/data-source';
import { getTabIcon, getTabName } from '@utils/navigation';
import { IconType } from '@components/list-view-icon';
import { addAttachedDB, addFlatFileDataSource } from '@utils/data-source';
import { getAttachedDBs, getDatabaseModel, getViews } from '@controllers/db/duckdb-meta';
import { DataBaseModel } from '@models/db';
import { DataViewCacheItem, DataViewCacheKey } from '@models/data-adapter';
import {
  CONTENT_VIEW_TABLE_NAME,
  DATA_SOURCE_TABLE_NAME,
  DATA_VIEW_CACHE_TABLE_NAME,
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

export const useAppStore =
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
  return useAppStore((state) => {
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

export function useIsSqlScriptIdOnActiveTab(id: SQLScriptId | null): boolean {
  return useAppStore((state) => {
    if (!id) return false;
    if (!state.activeTabId) return false;

    const tab = state.tabs.get(state.activeTabId);
    if (!tab) return false;
    if (tab.type !== 'script') {
      return false;
    }

    return tab.sqlScriptId === id;
  });
}

export function useIsAttachedDBElementOnActiveTab(
  id: PersistentDataSourceId | null | undefined,
  schemaName: string | null | undefined,
  objectName: string | null | undefined,
  columnName: string | null | undefined,
): boolean {
  return useAppStore((state) => {
    // If we do not have db source id, schema & object OR we have a column
    // means this can't be displayed in the tab. Only tables/views aka objects
    // can be displayed in the tab.
    if (!id || !schemaName || !objectName || columnName) return false;
    if (!state.activeTabId) return false;

    const tab = state.tabs.get(state.activeTabId);
    if (!tab) return false;
    if (tab.type !== 'data-source' || tab.dataSourceType !== 'db') {
      return false;
    }

    return (
      tab.dataSourceId === id && tab.schemaName === schemaName && tab.objectName === objectName
    );
  });
}

export function useDataSourceIdForActiveTab(): PersistentDataSourceId | null {
  return useAppStore((state) => {
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

export function useProtectedViews(): Set<string> {
  return useAppStore(
    useShallow(
      (state) =>
        new Set(
          state.dataSources
            .values()
            .filter((dataSource) => dataSource.type !== 'attached-db')
            .map((dataSource): string => dataSource.viewName),
        ),
    ),
  );
}

export function useAttachedDBDataSourceMap(): Map<PersistentDataSourceId, AttachedDB> {
  return useAppStore(
    useShallow(
      (state) =>
        new Map(
          state.dataSources
            .entries()
            // Unfortunately, typescript doesn't infer from filter here, hence explicit cast
            .filter(([, dataSource]) => dataSource.type === 'attached-db') as IteratorObject<
            [PersistentDataSourceId, AttachedDB]
          >,
        ),
    ),
  );
}

export function useAttachedDBLocalEntriesMap(): Map<LocalEntryId, LocalFile> {
  return useAppStore(
    useShallow(
      (state) =>
        new Map(
          state.dataSources
            .values()
            // Unfortunately, typescript doesn't infer from filter here, hence explicit cast
            .filter((dataSource) => dataSource.type === 'attached-db')
            .map((attachedDB) => state.localEntries.get(attachedDB.fileSourceId))
            // This filter should be unnecessary as this should always be true,
            // unless our state is inconsistent state. But for safety we check it.
            .filter((entry): entry is LocalFile => !!entry && entry.kind === 'file')
            .map((entry) => [entry.id, entry]),
        ),
    ),
  );
}

export function useSqlScriptNameMap(): Map<SQLScriptId, string> {
  return useAppStore(
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
  return useAppStore(
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
  return useAppStore(
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
  useAppStore.setState({ appLoadState: appState }, undefined, 'AppStore/setAppLoadState');
};

export const setIDbConn = (iDbConn: IDBPDatabase<AppIdbSchema>) => {
  useAppStore.setState({ _iDbConn: iDbConn }, undefined, 'AppStore/setIDbConn');
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
  errors: string[];
}> => {
  const { _iDbConn: iDbConn, localEntries, dataSources, dataBaseMetadata } = useAppStore.getState();

  const usedEntryNames = new Set(
    localEntries
      .values()
      // For files we use uniqueAlias, but folders we use the file name without alias
      .map((entry) => (entry.kind === 'file' ? entry.uniqueAlias : entry.name)),
  );

  const errors: string[] = [];
  const newDatabaseNames: string[] = [];
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

          // And save to new dbs as we'll need it later to get new metadata
          newDatabaseNames.push(dbSource.dbName);

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
    dataBaseMetadata?: Map<string, DataBaseModel>;
  } = {
    localEntries: new Map(Array.from(localEntries).concat(newEntries)),
  };

  if (newDataSources.length > 0) {
    newState.dataSources = new Map(Array.from(dataSources).concat(newDataSources));
  }

  // Now read the metadata for the newly attached databases and
  // add it to state as well
  const newDataBaseMetadata = await getDatabaseModel(conn, newDatabaseNames);

  if (dataBaseMetadata) {
    const mergedDataBaseMetadata = new Map(dataBaseMetadata);

    newDataBaseMetadata?.forEach((dbModel, dbName) => mergedDataBaseMetadata.set(dbName, dbModel));

    newState.dataBaseMetadata = mergedDataBaseMetadata;
  } else {
    errors.push(
      'Failed to read newly attached database metadata. Neither explorer not auto-complete will not show objects for them. You may try deleting and re-attaching the database(s).',
    );
  }

  // Update the store
  useAppStore.setState(newState, undefined, 'AppStore/addLocalFileOrFolders');

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
    errors,
  };
};

export const importSQLFilesAndCreateScripts = async (handles: FileSystemFileHandle[]) => {
  const { _iDbConn: iDbConn, sqlScripts } = useAppStore.getState();

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
  useAppStore.setState(newState, undefined, 'AppStore/importSQLFiles');

  // If we have an IndexedDB connection, persist the new SQL scripts
  if (iDbConn) {
    for (const [id, script] of newScripts) {
      iDbConn.put(SQL_SCRIPT_TABLE_NAME, script, id);
    }
  }
};

export const createSQLScript = (name: string = 'query', content: string = ''): SQLScript => {
  const { sqlScripts } = useAppStore.getState();
  const allNames = new Set(sqlScripts.values().map((script) => script.name));

  const fileName = findUniqueName(name, (value) => allNames.has(value));
  const sqlScriptId = uuidv4() as SQLScriptId;
  const sqlScript: SQLScript = {
    id: sqlScriptId,
    name: fileName,
    content,
  };

  // Add the new SQL script to the store
  useAppStore.setState(
    (state) => ({
      sqlScripts: new Map(state.sqlScripts).set(sqlScriptId, sqlScript),
    }),
    undefined,
    'AppStore/createSQLScript',
  );

  // Persist the new SQL script to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(SQL_SCRIPT_TABLE_NAME, sqlScript, sqlScriptId);
  }

  return sqlScript;
};

export const renameSQLScript = (sqlScriptOrId: SQLScript | SQLScriptId, newName: string): void => {
  const { sqlScripts } = useAppStore.getState();

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
  useAppStore.setState(
    {
      sqlScripts: newSqlScripts,
    },
    undefined,
    'AppStore/renameSQLScript',
  );

  // Persist the changes to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(SQL_SCRIPT_TABLE_NAME, updatedScript, sqlScript.id);
  }
};

export const updateSQLScriptContent = (
  sqlScriptOrId: SQLScript | SQLScriptId,
  newContent: string,
): void => {
  const { sqlScripts } = useAppStore.getState();

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
  useAppStore.setState(
    {
      sqlScripts: newSqlScripts,
    },
    undefined,
    'AppStore/updateSQLScriptContent',
  );

  // Persist the changes to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(SQL_SCRIPT_TABLE_NAME, updatedScript, sqlScript.id);
  }
};

export const setTabOrder = (tabOrder: TabId[]) => {
  useAppStore.setState({ tabOrder }, undefined, 'AppStore/setTabOrder');

  const iDb = useAppStore.getState()._iDbConn;
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
  const { activeTabId } = useAppStore.getState();

  // If the tab is already active, do nothing
  if (activeTabId === tabId) return;

  useAppStore.setState({ activeTabId: tabId }, undefined, 'AppStore/setActiveTabId');

  const iDb = useAppStore.getState()._iDbConn;
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
  const { tabs, tabOrder, activeTabId, previewTabId, _iDbConn: iDbConn } = useAppStore.getState();

  // Check we have stuff to do
  if (previewTabId === tabId) return;

  // Preview tabs are tricky. See logic above

  // Cases 2 (with deletion)
  if (previewTabId && tabId) {
    const { newTabs, newTabOrder, newActiveTabId } = deleteTabImpl(
      [previewTabId],
      tabs,
      tabOrder,
      activeTabId,
      previewTabId,
    );

    // Update the store with the new state
    useAppStore.setState(
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
      persistDeleteTab(iDbConn, [previewTabId], newActiveTabId, tabId, newTabOrder);
    }

    return;
  }

  // Case 1 or 3
  useAppStore.setState({ previewTabId: tabId }, undefined, 'AppStore/setPreviewTabId');

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
  const state = useAppStore.getState();

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
  const state = useAppStore.getState();

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

  useAppStore.setState(
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
  const state = useAppStore.getState();
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
  const state = useAppStore.getState();

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

  useAppStore.setState(
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
  const state = useAppStore.getState();

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

  useAppStore.setState(
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
  deletedTabIds: TabId[],
  newActiveTabId: TabId | null,
  newPreviewTabId: TabId | null,
  newTabOrder: TabId[],
) => {
  const tx = iDb.transaction([TAB_TABLE_NAME, CONTENT_VIEW_TABLE_NAME], 'readwrite');

  // Delete each tab
  for (const tabId of deletedTabIds) {
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
  deletedDataSourceIds: PersistentDataSourceId[],
) => {
  const tx = iDb.transaction(DATA_SOURCE_TABLE_NAME, 'readwrite');

  // Delete each data source
  for (const id of deletedDataSourceIds) {
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
  const { tabs } = useAppStore.getState();

  // Find the tab associated with this script
  const tab = findTabFromScriptImpl(tabs, sqlScriptId);

  if (tab) {
    // Delete the found tab
    deleteTab([tab.id]);
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
  const { tabs } = useAppStore.getState();

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
  deleteTabIds: TabId[],
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
  const deleteSet = new Set(deleteTabIds);

  const newTabs = new Map(Array.from(tabs).filter(([id, _]) => !deleteSet.has(id)));
  const newTabOrder = tabOrder.filter((id) => !deleteSet.has(id));

  let newActiveTabId = activeTabId;
  if (activeTabId !== null && deleteSet.has(activeTabId)) {
    // Find the index of the first tab being deleted in the original order
    const firstDeletedIndex = Math.min(
      ...deleteTabIds
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

export const deleteTab = (tabIds: TabId[]) => {
  const { tabs, tabOrder, activeTabId, previewTabId, _iDbConn: iDbConn } = useAppStore.getState();
  const { newTabs, newTabOrder, newActiveTabId, newPreviewTabId } = deleteTabImpl(
    tabIds,
    tabs,
    tabOrder,
    activeTabId,
    previewTabId,
  );

  // Update the store with the new state
  useAppStore.setState(
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
    persistDeleteTab(iDbConn, tabIds, newActiveTabId, newPreviewTabId, newTabOrder);
  }
};

/**
 * Implementation of data source deletion that only removes the data sources from the map
 * without affecting any related data.
 *
 * @param deleteDataSourceIds - array of IDs of data sources to delete
 * @param dataSources - Current data sources map
 * @returns New data sources map with specified data sources removed
 */
const deleteDataSourceImpl = (
  deleteDataSourceIds: PersistentDataSourceId[],
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
): Map<PersistentDataSourceId, AnyDataSource> => {
  const deleteSet = new Set(deleteDataSourceIds);

  return new Map(Array.from(dataSources).filter(([id, _]) => !deleteSet.has(id)));
};

/**
 * Deletes one or more data sources from the store and persists the change.
 * This also deletes any tabs that are associated with the data sources being deleted.
 *
 * @param dataSourceIds - array of IDs of data sources to delete
 */
export const deleteDataSource = (
  db: AsyncDuckDB,
  conn: AsyncDuckDBConnection,
  dataSourceIds: PersistentDataSourceId[],
) => {
  const {
    dataSources,
    tabs,
    tabOrder,
    activeTabId,
    previewTabId,
    localEntries,
    _iDbConn: iDbConn,
  } = useAppStore.getState();

  const dataSourceIdsToDelete = new Set(dataSourceIds);

  // Save objects to be deleted - we'll need them later to delete from db
  const deletedDataSources = dataSourceIds
    .map((id) => dataSources.get(id))
    .filter((ds) => ds !== undefined);

  const newDataSources = deleteDataSourceImpl(dataSourceIds, dataSources);

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

  useAppStore.setState(
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
    persistDeleteDataSource(iDbConn, dataSourceIds);

    // Delete associated tabs from IndexedDB if any
    if (tabsToDelete.length) {
      persistDeleteTab(iDbConn, tabsToDelete, newActiveTabId, newPreviewTabId, newTabOrder);
    }
  }

  // Finally, delete the data sources from the database
  deletedDataSources.forEach((dataSource) => {
    if (dataSource.type === 'attached-db') {
      detachAndUnregisterDatabase(
        db,
        conn,
        dataSource.dbName,
        localEntries.get(dataSource.fileSourceId)?.uniqueAlias,
      );
    } else {
      dropViewAndUnregisterFile(
        db,
        conn,
        dataSource.viewName,
        localEntries.get(dataSource.fileSourceId)?.uniqueAlias,
      );
    }
  });
};

/**
 * Implementation of SQL script deletion that only removes the scripts from the map
 * without affecting any related data.
 *
 * @param deleteSqlScriptIds - array of IDs of SQL scripts to delete
 * @param sqlScripts - Current SQL scripts map
 * @returns New SQL scripts map with specified scripts removed
 */
const deleteSqlScriptImpl = (
  deleteSqlScriptIds: SQLScriptId[],
  sqlScripts: Map<SQLScriptId, SQLScript>,
): Map<SQLScriptId, SQLScript> => {
  const deleteSet = new Set(deleteSqlScriptIds);

  return new Map(Array.from(sqlScripts).filter(([id, _]) => !deleteSet.has(id)));
};

const persistDeleteSqlScript = async (
  iDb: IDBPDatabase<AppIdbSchema>,
  deletedSqlScriptIds: SQLScriptId[],
) => {
  const tx = iDb.transaction(SQL_SCRIPT_TABLE_NAME, 'readwrite');

  // Delete each SQL script
  for (const id of deletedSqlScriptIds) {
    await tx.objectStore(SQL_SCRIPT_TABLE_NAME).delete(id);
  }

  await tx.done;
};

/**
 * Deletes one or more SQL scripts from the store and persists the change.
 * This also deletes any tabs that are associated with the SQL scripts being deleted.
 *
 * @param sqlScriptIds - array of IDs of SQL scripts to delete
 */
export const deleteSqlScripts = (sqlScriptIds: SQLScriptId[]) => {
  const {
    sqlScripts,
    tabs,
    tabOrder,
    activeTabId,
    previewTabId,
    _iDbConn: iDbConn,
  } = useAppStore.getState();

  const sqlScriptIdsToDeleteSet = new Set(sqlScriptIds);

  const newSqlScripts = deleteSqlScriptImpl(sqlScriptIds, sqlScripts);

  const tabsToDelete: TabId[] = [];

  for (const [tabId, tab] of tabs.entries()) {
    if (tab.type === 'script') {
      if (sqlScriptIdsToDeleteSet.has(tab.sqlScriptId)) {
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

  useAppStore.setState(
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
    persistDeleteSqlScript(iDbConn, sqlScriptIds);

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
  const { tabs } = useAppStore.getState();

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
  useAppStore.setState(
    {
      tabs: newTabs,
    },
    undefined,
    'AppStore/updateTabDataViewLayout',
  );

  // Persist the changes to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, tab.id);
  }
};

export const updateScriptTabEditorPaneHeight = (tab: ScriptTab, newPaneHeight: number): void => {
  const { tabs } = useAppStore.getState();

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
  useAppStore.setState(
    {
      tabs: newTabs,
    },
    undefined,
    'AppStore/updateScriptTabEditorPaneHeight',
  );

  // Persist the changes to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, tab.id);
  }
};

export const resetAppState = async () => {
  const { _iDbConn: iDbConn, appLoadState } = useAppStore.getState();

  // Drop all table data first
  if (iDbConn) {
    await resetAppData(iDbConn);
  }

  // Reset the store to its initial state except for the iDbConn and appLoadState
  useAppStore.setState(
    { ...initialState, _iDbConn: iDbConn, appLoadState },
    undefined,
    'AppStore/resetAppState',
  );
};

/**
 * Updates the data view cache with a new value.
 *
 * @param entry - A single entry to update in the cache
 */
export const updateDataViewCache = (entry: DataViewCacheItem): void => {
  const { dataViewCache, _iDbConn: iDbConn } = useAppStore.getState();
  console.log({
    entry,
  });

  // We assume the item has a property that can be used as a key
  // This is a critical assumption - the item must have some unique identifier
  if (!entry.key) {
    console.error('DataViewCacheItem missing ID property', entry);
    return;
  }

  // Create a new Map with all existing entries plus new/updated one
  const newDataViewCache = new Map(dataViewCache);
  newDataViewCache.set(entry.key, entry);

  // Update the store
  useAppStore.setState(
    { dataViewCache: newDataViewCache },
    undefined,
    'AppStore/updateDataViewCache',
  );

  // If we have an IndexedDB connection, persist the cache update
  if (iDbConn) {
    iDbConn.put(DATA_VIEW_CACHE_TABLE_NAME, entry, entry.key);
  }
};

/**
 * Removes entries from the data view cache.
 *
 * @param keys - A single key or an array of keys to remove from the cache
 */
export const removeDataViewCacheEntries = (keys: DataViewCacheKey | DataViewCacheKey[]): void => {
  const { dataViewCache, _iDbConn: iDbConn } = useAppStore.getState();

  // Handle both single key and array of keys
  const keysToRemove = Array.isArray(keys) ? keys : [keys];
  const keysSet = new Set(keysToRemove);

  // Skip if there's nothing to remove
  if (keysToRemove.length === 0) return;

  // Create a new Map excluding the keys to be removed
  const newDataViewCache = new Map(Array.from(dataViewCache).filter(([key]) => !keysSet.has(key)));

  // Update the store
  useAppStore.setState(
    { dataViewCache: newDataViewCache },
    undefined,
    'AppStore/removeDataViewCacheEntries',
  );

  // If we have an IndexedDB connection, persist the deletion
  if (iDbConn) {
    // Delete each entry from IndexedDB
    for (const key of keysToRemove) {
      iDbConn.delete(DATA_VIEW_CACHE_TABLE_NAME, key);
    }
  }
};
