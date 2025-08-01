// Public tab controller API's
// By convetion the order should follow CRUD groups!
import {
  AnyFlatFileDataSource,
  LocalDB,
  PersistentDataSourceId,
  RemoteDB,
  MotherDuckDB,
} from '@models/data-source';
import { ColumnSortSpecList } from '@models/db';
import { LocalEntryId } from '@models/file-system';
import { CONTENT_VIEW_TABLE_NAME, TAB_TABLE_NAME } from '@models/persisted-store';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import {
  LocalDBDataTab,
  FlatFileDataSourceTab,
  SchemaBrowserTab,
  ScriptTab,
  StaleData,
  TabId,
} from '@models/tab';
import { useAppStore } from '@store/app-store';
import { ensureDatabaseDataSource, ensureFlatFileDataSource } from '@utils/data-source';
import { ensureScript } from '@utils/sql-script';
import { ensureTab, makeTabId } from '@utils/tab';
import { shallow } from 'zustand/shallow';

import { persistCreateTab, persistDeleteTab } from './persist';
import {
  deleteTabImpl,
  findTabFromLocalDBObjectImpl,
  findTabFromFlatFileDataSourceImpl,
  findTabFromScriptImpl,
} from './pure';

// Tab execution error types
export interface TabExecutionError {
  errorMessage: string;
  statementType?: string;
  timestamp: number;
}

/**
 * ------------------------------------------------------------
 * -------------------------- Create --------------------------
 * ------------------------------------------------------------
 */

/**
 * Creates a new schema browser tab or returns an existing one.
 *
 * @param options - Configuration options for the schema browser tab
 * @param options.sourceId - ID of the source (data source or folder) to visualize schema for, null for all sources
 * @param options.sourceType - Type of source ('file', 'db', 'folder', or 'all')
 * @param options.setActive - Whether to set the tab as active
 * @returns A schema browser tab
 */
export const getOrCreateSchemaBrowserTab = (options: {
  sourceId: PersistentDataSourceId | LocalEntryId | null;
  sourceType: 'file' | 'db' | 'folder' | 'all';
  schemaName?: string;
  objectNames?: string[];
  setActive?: boolean;
}): SchemaBrowserTab => {
  const { sourceId, sourceType, schemaName, setActive = false } = options;
  // Sort objectNames for consistent comparison and storage
  const objectNames = options.objectNames ? [...options.objectNames].sort() : undefined;
  const state = useAppStore.getState();

  const existingTab = findSchemaBrowserTab(sourceId, sourceType, schemaName, objectNames);

  if (existingTab) {
    if (setActive) {
      setActiveTabId(existingTab.id);
    }
    return existingTab;
  }

  const tabId = makeTabId();
  const tab: SchemaBrowserTab = {
    type: 'schema-browser',
    id: tabId,
    sourceId,
    sourceType,
    schemaName,
    objectNames,
    dataViewStateCache: null,
  };

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
    'AppStore/createSchemaBrowserTab',
  );

  const iDb = state._iDbConn;
  if (iDb) {
    persistCreateTab(iDb, tab, newTabOrder, newActiveTabId);
  }

  return tab;
};

/**
 * Gets existing or creates a new tab for a given table/view in a local database.
 * If the source is already associated with a tab, it returns that tab without creating a new one.
 *
 * @param dataSourceOrId - The ID of an object to create a tab from.
 * @param schemaName - The name of the schema.
 * @param objectName - The name of the table or view.
 * @param objectType - The type of the object, either 'table' or 'view'.
 * @param setActive - Whether to set the new tab as active. This is a shortcut for
 *                  calling `setActiveTabId(tab.id)` on the returned tab.
 * @returns A new Tab object.
 * @throws An error if the Local DB with the given ID does not exist.
 */
export const getOrCreateTabFromLocalDBObject = (
  dataSourceOrId: LocalDB | RemoteDB | MotherDuckDB | PersistentDataSourceId,
  schemaName: string,
  objectName: string,
  objectType: 'table' | 'view',
  setActive: boolean = false,
): LocalDBDataTab => {
  const state = useAppStore.getState();

  // Get the database (attached or remote) as an object
  const dataSource = ensureDatabaseDataSource(dataSourceOrId, state.dataSources);

  // Check if object already has an associated tab
  const existingTab = findTabFromLocalDBObjectImpl(state.tabs, dataSource, schemaName, objectName);

  // No need to create a new tab if one already exists
  if (existingTab) {
    // Since we didn't change any state, we can reuse existing action directly
    if (setActive) {
      setActiveTabId(existingTab.id);
    }
    return existingTab;
  }

  // Create a new tab
  const tabId = makeTabId();
  const tab: LocalDBDataTab = {
    type: 'data-source',
    dataSourceType: 'db',
    id: tabId,
    dataSourceId: dataSource.id,
    schemaName,
    objectName,
    objectType,
    dataViewStateCache: null,
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
): FlatFileDataSourceTab => {
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
  const tabId = makeTabId();
  const tab: FlatFileDataSourceTab = {
    type: 'data-source',
    dataSourceType: 'file',
    id: tabId,
    dataSourceId: dataSource.id,
    dataViewStateCache: null,
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
  const tabId = makeTabId();
  const tab: ScriptTab = {
    type: 'script',
    id: tabId,
    sqlScriptId: sqlScript.id,
    dataViewPaneHeight: 0,
    editorPaneHeight: 0,
    lastExecutedQuery: null,
    dataViewStateCache: null,
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
 * ------------------------------------------------------------
 * -------------------------- Read ---------------------------
 * ------------------------------------------------------------
 */

/**
 * Finds a schema browser tab for the given source.
 *
 * @param sourceId - ID of the source to visualize schema for, null for all sources
 * @param sourceType - Type of source ('file', 'db', 'folder', or 'all')
 * @param schemaName - Optional schema name for database-specific views
 * @param objectNames - Optional object names for table/view-specific views
 * @returns The schema browser tab if found, undefined otherwise
 */
export const findSchemaBrowserTab = (
  sourceId: PersistentDataSourceId | LocalEntryId | null,
  sourceType: 'file' | 'db' | 'folder' | 'all',
  schemaName?: string,
  objectNames?: string[],
): SchemaBrowserTab | undefined => {
  const { tabs } = useAppStore.getState();

  for (const tab of tabs.values()) {
    if (tab.type === 'schema-browser') {
      const schemaBrowserTab = tab as SchemaBrowserTab;

      if (
        schemaBrowserTab.sourceType === sourceType &&
        ((sourceId === null && schemaBrowserTab.sourceId === null) ||
          (sourceId !== null && schemaBrowserTab.sourceId === sourceId)) &&
        schemaBrowserTab.schemaName === schemaName &&
        JSON.stringify(
          schemaBrowserTab.objectNames ? [...schemaBrowserTab.objectNames].sort() : undefined,
        ) === JSON.stringify(objectNames ? [...objectNames].sort() : undefined)
      ) {
        return schemaBrowserTab;
      }
    }
  }

  return undefined;
};

/**
 * Finds a tab displaying an existing Local DB object or undefined.
 *
 * @param dataSourceOrId - The ID or a Local DB object to find the tab for.
 * @returns A new Tab object if found.
 * @throws An error if the Local DB with the given ID does not exist.
 */
export const findTabFromLocalDBObject = (
  dataSourceOrId: LocalDB | RemoteDB | MotherDuckDB | PersistentDataSourceId,
  schemaName: string,
  objectName: string,
): LocalDBDataTab | undefined => {
  const state = useAppStore.getState();

  // Get the database (attached or remote) as an object
  const dataSource = ensureDatabaseDataSource(dataSourceOrId, state.dataSources);

  // Check if the script already has an associated tab
  return findTabFromLocalDBObjectImpl(state.tabs, dataSource, schemaName, objectName);
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
 * ------------------------------------------------------------
 * -------------------------- Update --------------------------
 * ------------------------------------------------------------
 */

export const updateTabDataViewStaleDataCache = (
  tabId: TabId,
  newCache: { sort: ColumnSortSpecList; staleData: Partial<StaleData> },
): void => {
  const { tabs } = useAppStore.getState();

  // By the time this runs, a preview tab can already be deleted due to
  // async reads, so we allow gracefully ignoring such tab
  if (!tabs.has(tabId)) return;

  // We have to use a tab object from the store
  const currentTab = ensureTab(tabId, tabs);

  // Create a full model of the incoming stale data if the current
  // state does not have it as a fallback
  // Ensure data is serializable by converting any DuckDB Row objects to plain objects
  const serializableData = newCache.staleData?.data
    ? newCache.staleData.data.map((row) => {
        // If it's already a plain object, return as is
        if (row && typeof row === 'object' && row.constructor === Object) {
          return row;
        }
        // If it's a DuckDB Row or other object, convert to plain object
        if (row && typeof row === 'object') {
          const plainRow: Record<string, any> = {};
          for (const key in row) {
            if (Object.prototype.hasOwnProperty.call(row, key)) {
              plainRow[key] = (row as any)[key];
            }
          }
          return plainRow;
        }
        return row;
      })
    : [];

  const fullNewStaleData = {
    schema: [],
    rowOffset: 0,
    realRowCount: null,
    estimatedRowCount: null,
    ...newCache.staleData,
    data: serializableData, // Override with serializable version
  };

  // Create new tab object with updated layout
  const updatedTab = {
    ...currentTab,
    dataViewStateCache: currentTab.dataViewStateCache
      ? {
          ...currentTab.dataViewStateCache,
          sort: newCache.sort,
          staleData: currentTab.dataViewStateCache.staleData
            ? {
                ...currentTab.dataViewStateCache.staleData,
                ...newCache.staleData,
                data: serializableData, // Override with serializable version
              }
            : fullNewStaleData,
        }
      : {
          tableColumnSizes: null,
          dataViewPage: null,
          sort: newCache.sort,
          staleData: fullNewStaleData,
        },
  };

  // Update the store
  const newTabs = new Map(tabs);
  newTabs.set(currentTab.id, updatedTab);

  // Update the store with changes
  useAppStore.setState(
    {
      tabs: newTabs,
    },
    undefined,
    'AppStore/updateTabDataViewStaleDataCache',
  );

  // Persist the changes to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, currentTab.id);
  }
};

export const updateTabDataViewColumnSizesCache = (
  tabId: TabId,
  newColumnSizes: Record<string, number>,
): void => {
  const { tabs } = useAppStore.getState();

  // We have to use a tab object from the store
  const currentTab = ensureTab(tabId, tabs);

  // Check if they are different
  if (!shallow(currentTab.dataViewStateCache?.tableColumnSizes, newColumnSizes)) {
    // No changes, nothing to do
    return;
  }

  // Create new tab object with updated layout
  const updatedTab = {
    ...currentTab,
    dataViewStateCache: currentTab.dataViewStateCache
      ? {
          ...currentTab.dataViewStateCache,
          tableColumnSizes: newColumnSizes,
        }
      : {
          tableColumnSizes: newColumnSizes,
          dataViewPage: null,
          sort: null,
          staleData: null,
        },
  };

  // Update the store
  const newTabs = new Map(tabs);
  newTabs.set(currentTab.id, updatedTab);

  // Update the store with changes
  useAppStore.setState(
    {
      tabs: newTabs,
    },
    undefined,
    'AppStore/updateTabDataViewColumnSizesCache',
  );

  // Persist the changes to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, currentTab.id);
  }
};

export const updateTabDataViewDataPageCache = (tabId: TabId, newDataPage: number): void => {
  const { tabs } = useAppStore.getState();

  // We have to use a tab object from the store
  const currentTab = ensureTab(tabId, tabs);

  // Check if they are different
  if (currentTab.dataViewStateCache?.dataViewPage === newDataPage) {
    // No changes, nothing to do
    return;
  }

  // Create new tab object with updated layout
  const updatedTab = {
    ...currentTab,
    dataViewStateCache: currentTab.dataViewStateCache
      ? {
          ...currentTab.dataViewStateCache,
          dataViewPage: newDataPage,
        }
      : {
          dataViewPage: newDataPage,
          tableColumnSizes: null,
          sort: null,
          staleData: null,
        },
  };

  // Update the store
  const newTabs = new Map(tabs);
  newTabs.set(currentTab.id, updatedTab);

  // Update the store with changes
  useAppStore.setState(
    {
      tabs: newTabs,
    },
    undefined,
    'AppStore/updateTabDataViewDataPageCache',
  );

  // Persist the changes to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, currentTab.id);
  }
};

/**
 * Updates the last executed query for a script tab.
 *
 * @param tabId - The ID of the tab to update.
 * @param lastExecutedQuery - The last executed query to set. If null, it will be removed.
 * @param force - If true, the update will be applied even if the last executed query is the same.
 */
export const updateScriptTabLastExecutedQuery = ({
  tabId,
  lastExecutedQuery,
  force,
}: {
  tabId: TabId;
  lastExecutedQuery: string | null;
  force: boolean;
}): void => {
  const { tabs } = useAppStore.getState();

  // We have to use a tab object from the store
  const currentTab = ensureTab(tabId, tabs);

  // Assert tab type
  if (currentTab.type !== 'script') {
    console.error(
      `updateScriptTabLastExecutedQuery: Expected tab type 'script', but got '${currentTab.type}'`,
    );
    return;
  }

  // Check if they are different
  if (!force && currentTab.lastExecutedQuery === lastExecutedQuery) {
    // No changes, nothing to do
    return;
  }

  // Create new tab object with updated layout
  const updatedTab = {
    ...currentTab,
    lastExecutedQuery,
  };

  // Update the store
  const newTabs = new Map(tabs);
  newTabs.set(currentTab.id, updatedTab);

  // Update the store with changes
  useAppStore.setState(
    {
      tabs: newTabs,
    },
    undefined,
    'AppStore/updateScriptTabLastExecutedQuery',
  );

  // Persist the changes to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, currentTab.id);
  }
};

export const updateScriptTabLayout = (
  tabId: TabId,
  [editorPaneHeight, dataViewPaneHeight]: [number, number],
): void => {
  const { tabs } = useAppStore.getState();
  // We have to use a tab object from the store
  const currentTab = ensureTab(tabId, tabs);

  // Type check
  if (currentTab?.type !== 'script') {
    return;
  }

  // Check for changes
  if (
    currentTab.editorPaneHeight === editorPaneHeight &&
    currentTab.dataViewPaneHeight === dataViewPaneHeight
  ) {
    // No changes, nothing to do
    return;
  }

  // Create new tab object with updated layout
  const updatedTab: ScriptTab = {
    ...currentTab,
    editorPaneHeight,
    dataViewPaneHeight,
  };

  // Update the store
  const newTabs = new Map(tabs);
  newTabs.set(currentTab.id, updatedTab);

  // Update the store with changes
  useAppStore.setState(
    {
      tabs: newTabs,
    },
    undefined,
    'AppStore/updateScriptTabLayout',
  );

  // Persist the changes to IndexedDB
  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, currentTab.id);
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
    const { newTabs, newTabOrder, newActiveTabId } = deleteTabImpl({
      deleteTabIds: [previewTabId],
      tabs,
      tabOrder,
      activeTabId,
      previewTabId,
    });

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

export const setTabOrder = (tabOrder: TabId[]) => {
  useAppStore.setState({ tabOrder }, undefined, 'AppStore/setTabOrder');

  const iDb = useAppStore.getState()._iDbConn;
  if (iDb) {
    iDb.put(CONTENT_VIEW_TABLE_NAME, tabOrder, 'tabOrder');
  }
};

/**
 * ------------------------------------------------------------
 * -------------------------- Delete --------------------------
 * ------------------------------------------------------------
 */

export const deleteTab = (tabIds: TabId[]) => {
  const {
    tabs,
    tabOrder,
    activeTabId,
    previewTabId,
    tabExecutionErrors,
    _iDbConn: iDbConn,
  } = useAppStore.getState();

  const { newTabs, newTabOrder, newActiveTabId, newPreviewTabId } = deleteTabImpl({
    deleteTabIds: tabIds,
    tabs,
    tabOrder,
    activeTabId,
    previewTabId,
  });

  // Clear execution errors for deleted tabs
  const newTabExecutionErrors = new Map(tabExecutionErrors);
  tabIds.forEach((tabId) => newTabExecutionErrors.delete(tabId));

  // Update the store with the new state
  useAppStore.setState(
    {
      tabs: newTabs,
      tabOrder: newTabOrder,
      activeTabId: newActiveTabId,
      previewTabId: newPreviewTabId,
      tabExecutionErrors: newTabExecutionErrors,
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

/**
 * ------------------------------------------------------------
 * -------------------- Execution Errors ----------------------
 * ------------------------------------------------------------
 */

/**
 * Sets an execution error for a specific tab.
 *
 * @param tabId - The ID of the tab
 * @param error - The execution error details
 */
export const setTabExecutionError = (tabId: TabId, error: TabExecutionError): void => {
  const { tabExecutionErrors } = useAppStore.getState();

  const newErrors = new Map(tabExecutionErrors);
  newErrors.set(tabId, error);

  useAppStore.setState(
    { tabExecutionErrors: newErrors },
    undefined,
    'TabController/setExecutionError',
  );
};

/**
 * Clears the execution error for a specific tab.
 *
 * @param tabId - The ID of the tab
 */
export const clearTabExecutionError = (tabId: TabId): void => {
  const { tabExecutionErrors } = useAppStore.getState();

  if (!tabExecutionErrors.has(tabId)) {
    return; // No error to clear
  }

  const newErrors = new Map(tabExecutionErrors);
  newErrors.delete(tabId);

  useAppStore.setState(
    { tabExecutionErrors: newErrors },
    undefined,
    'TabController/clearExecutionError',
  );
};

/**
 * Clears all tab execution errors.
 */
export const clearAllTabExecutionErrors = (): void => {
  useAppStore.setState(
    { tabExecutionErrors: new Map() },
    undefined,
    'TabController/clearAllExecutionErrors',
  );
};
