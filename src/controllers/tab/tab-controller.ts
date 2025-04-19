// Public tab controller API's
// By convetion the order should follow CRUD groups!
import { AnyFlatFileDataSource, AttachedDB, PersistentDataSourceId } from '@models/data-source';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { AttachedDBDataTab, FlatFileDataSourceTab, ScriptTab, StaleData, TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { CONTENT_VIEW_TABLE_NAME, TAB_TABLE_NAME } from '@models/persisted-store';
import { ensureScript } from '@utils/sql-script';
import { ensureTab, makeTabId } from '@utils/tab';
import { ensureAttachedDBDataSource, ensureFlatFileDataSource } from '@utils/data-source';
import { shallow } from 'zustand/shallow';
import { ColumnSortSpecList } from '@models/db';
import { persistCreateTab, persistDeleteTab } from './persist';
import {
  deleteTabImpl,
  findTabFromAttachedDBObjectImpl,
  findTabFromFlatFileDataSourceImpl,
  findTabFromScriptImpl,
} from './pure';

/**
 * ------------------------------------------------------------
 * -------------------------- Create --------------------------
 * ------------------------------------------------------------
 */

/**
 * Gets existing or creates a new tab for a given table/view in an attached database.
 * If the source is already associated with a tab, it returns that tab without creating a new one.
 *
 * @param dataSourceOrId - The ID of an object to create a tab from.
 * @param schemaName - The name of the schema.
 * @param objectName - The name of the table or view.
 * @param objectType - The type of the object, either 'table' or 'view'.
 * @param setActive - Whether to set the new tab as active. This is a shortcut for
 *                  calling `setActiveTabId(tab.id)` on the returned tab.
 * @returns A new Tab object.
 * @throws An error if the Attached DB with the given ID does not exist.
 */
export const getOrCreateTabFromAttachedDBObject = (
  dataSourceOrId: AttachedDB | PersistentDataSourceId,
  schemaName: string,
  objectName: string,
  objectType: 'table' | 'view',
  setActive: boolean = false,
): AttachedDBDataTab => {
  const state = useAppStore.getState();

  // Get the attached db as an object
  const dataSource = ensureAttachedDBDataSource(dataSourceOrId, state.dataSources);

  // Check if object already has an associated tab
  const existingTab = findTabFromAttachedDBObjectImpl(
    state.tabs,
    dataSource,
    schemaName,
    objectName,
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
  const tabId = makeTabId();
  const tab: AttachedDBDataTab = {
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
 * Finds a tab displaying an existing Attached DB object or undefined.
 *
 * @param dataSourceOrId - The ID or an Attached DB object to find the tab for.
 * @returns A new Tab object if found.
 * @throws An error if the Attached DB with the given ID does not exist.
 */
export const findTabFromAttachedDBObject = (
  dataSourceOrId: AttachedDB | PersistentDataSourceId,
  schemaName: string,
  objectName: string,
): AttachedDBDataTab | undefined => {
  const state = useAppStore.getState();

  // Get the attached db as an object
  const dataSource = ensureAttachedDBDataSource(dataSourceOrId, state.dataSources);

  // Check if the script already has an associated tab
  return findTabFromAttachedDBObjectImpl(state.tabs, dataSource, schemaName, objectName);
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
  newCache: { sort: ColumnSortSpecList; staleData: StaleData },
): void => {
  const { tabs } = useAppStore.getState();

  // We have to use a tab object from the store
  const currentTab = ensureTab(tabId, tabs);

  // Create new tab object with updated layout
  const updatedTab = {
    ...currentTab,
    dataViewStateCache: currentTab.dataViewStateCache
      ? {
          ...currentTab.dataViewStateCache,
          sort: newCache.sort,
          staleData: newCache.staleData,
        }
      : {
          tableColumnSizes: null,
          dataViewPage: null,
          sort: newCache.sort,
          staleData: newCache.staleData,
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

export const updateScriptTabLastExecutedQuery = (
  tabId: TabId,
  lastExecutedQuery: string | null,
): void => {
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
  if (currentTab.lastExecutedQuery === lastExecutedQuery) {
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
  const { tabs, tabOrder, activeTabId, previewTabId, _iDbConn: iDbConn } = useAppStore.getState();

  const { newTabs, newTabOrder, newActiveTabId, newPreviewTabId } = deleteTabImpl({
    deleteTabIds: tabIds,
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
