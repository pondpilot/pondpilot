import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { v4 as uuidv4 } from 'uuid';
import { findUniqueName } from '@utils/helpers';
import { Tab, TabId, TabMetaInfo } from '@models/tab';
import { IDBPDatabase } from 'idb';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { ContentViewState } from '@models/content-view';
import { DataSourceIconType, DataSourceId } from '@models/data-source';
import { CONTENT_VIEW_TABLE_NAME, SQL_SCRIPT_TABLE_NAME, TAB_TABLE_NAME } from './persist/const';
import { createSelectors } from './utils';
import { AppIdbSchema } from './persist/model';

type AppLoadState = 'init' | 'ready' | 'error';

type AppStore = {
  /**
   * The current state of the app, indicating whether it is loading, ready, or has encountered an error.
   */
  appLoadState: AppLoadState;
  /**
   * Connection to the IndexedDB database. May be null if we had an error
   * while opening the database.
   *
   * Used to persist the app state when connection is available.
   */
  iDbConn: IDBPDatabase<AppIdbSchema> | null;

  /**
   * A mapping of SQL script identifiers to their corresponding SQLScript objects.
   */
  sqlScripts: Map<SQLScriptId, SQLScript>;
} & ContentViewState;

export const useInitStore =
  // Wrapper that creates simple getters, so you can just call
  // `useInitStore.use.someStateAttr()` instead of `useInitStore((state) => state.someStateAttr)`
  createSelectors(
    create<AppStore>()(
      // Adds redux devtools support - use in Chrome!
      devtools(
        (): AppStore => ({
          appLoadState: 'init',
          iDbConn: null,
          sqlScripts: new Map(),
          activeTabId: null,
          previewTabId: null,
          tabs: new Map(),
          tabOrder: [],
        }),
        { name: 'AppStore' },
      ),
    ),
  );

// Memoized selectors
// eslint-disable-next-line arrow-body-style
export const useTabMetaInfoMap = (): Map<TabId, TabMetaInfo> => {
  return useInitStore(
    useShallow(
      (state) =>
        new Map(Array.from(state.tabs).map(([id, tab]): [TabId, TabMetaInfo] => [id, tab.meta])),
    ),
  );
};

// Actions / setters
export const setAppLoadState = (appState: AppLoadState) => {
  useInitStore.setState({ appLoadState: appState }, undefined, 'AppStore/setAppLoadState');
};

export const setIDbConn = (iDbConn: IDBPDatabase<AppIdbSchema>) => {
  useInitStore.setState({ iDbConn }, undefined, 'AppStore/setIDbConn');
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
  const iDb = useInitStore.getState().iDbConn;
  if (iDb) {
    iDb.put(SQL_SCRIPT_TABLE_NAME, sqlScript, sqlScriptId);
  }

  return sqlScript;
};

export const setTabOrder = (tabOrder: TabId[]) => {
  useInitStore.setState({ tabOrder }, undefined, 'AppStore/setTabOrder');

  const iDb = useInitStore.getState().iDbConn;
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

  const iDb = useInitStore.getState().iDbConn;
  if (iDb) {
    iDb.put(CONTENT_VIEW_TABLE_NAME, tabId, 'activeTabId');
  }
};

/**
 * Sets/resets the preview tab id.
 *
 * Idempotent, if the tab is already in preview, it does nothing.
 *
 * @param tabId - The id of the tab to set as preview or null to reset.
 */
export const setPreviewTabId = (tabId: TabId | null) => {
  const { previewTabId } = useInitStore.getState();

  // If the tab is already in preview, do nothing
  if (previewTabId === tabId) return;

  useInitStore.setState({ previewTabId: tabId }, undefined, 'AppStore/setPreviewTabId');

  const iDb = useInitStore.getState().iDbConn;
  if (iDb) {
    iDb.put(CONTENT_VIEW_TABLE_NAME, tabId, 'previewTabId');
  }
};

// Tab related CRUD
const resolveTabIconType = (
  sqlScriptId: SQLScriptId | null = null,
  dataSourceId: DataSourceId | null = null,
): DataSourceIconType => {
  if (sqlScriptId) {
    return 'sql-script';
  }

  throw new Error('TODO');
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

/**
 * Creates a new tab from an existing SQL script.
 * If the SQL script is already associated with a tab, it returns that tab without creating a new one.
 *
 * @param sqlScriptOrId - The ID of the SQL script to create a tab from.
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
  const existingTab = Array.from(state.tabs.values()).find(
    (tab) => tab.sqlScriptId === sqlScript.id,
  );

  // No need to create a new tab if one already exists
  if (existingTab) {
    return existingTab;
  }

  // Create a new tab
  const tabId = uuidv4() as TabId;
  const tab: Tab = {
    id: tabId,
    meta: { name: sqlScript.name, iconType: resolveTabIconType(sqlScript.id, null) },
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
  const iDb = state.iDbConn;
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

export const deleteTab = (tabId: TabId) => {
  const state = useInitStore.getState();
  const { tabs, tabOrder, activeTabId, previewTabId } = state;
  const newTabs = new Map(Array.from(tabs).filter(([id, _]) => id !== tabId));
  const newTabOrder = tabOrder.filter((id) => id !== tabId);
  let newActiveTabId = activeTabId;

  // If the active tab is being deleted, set active to the next one in order (or null)
  if (activeTabId === tabId) {
    const prevTabIndex = tabOrder.findIndex((id) => id === tabId) - 1;
    newActiveTabId = newTabOrder[prevTabIndex] || null;
  }

  // If the preview tab is being deleted, reset it to null
  const newPreviewTabId = previewTabId === tabId ? null : previewTabId;

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

  const iDb = useInitStore.getState().iDbConn;
  if (iDb) {
    persistDeleteTab(iDb, tabId, newActiveTabId, newPreviewTabId, newTabOrder);
  }
};
