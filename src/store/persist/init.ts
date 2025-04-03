import { IDBPDatabase, openDB } from 'idb';
import { TabId } from '@models/tab';
import { useInitStore } from '@store/init-store';
import { AppIdbSchema } from './model';
import {
  ALL_TABLES,
  APP_DB_NAME,
  CONTENT_VIEW_TABLE_NAME,
  DB_VERSION,
  SQL_SCRIPT_TABLE_NAME,
  TAB_TABLE_NAME,
} from './const';

function getAppDataDBConnection(): Promise<IDBPDatabase<AppIdbSchema>> {
  return openDB(APP_DB_NAME, DB_VERSION, {
    upgrade(db) {
      for (const storeName of ALL_TABLES) {
        db.createObjectStore(storeName);
      }
    },
  });
}

/**
 * Hydrates the app data from IndexedDB into the store.
 *
 * This is not a hook, so can be used anywhere in the app.
 *
 * @returns {Promise<void>} A promise that resolves when the data is hydrated.
 */
export const hydrateAppData = async (): Promise<void> => {
  const db = await getAppDataDBConnection();

  const tx = db.transaction(
    [TAB_TABLE_NAME, SQL_SCRIPT_TABLE_NAME, CONTENT_VIEW_TABLE_NAME],
    'readonly',
  );

  let { activeTabId, previewTabId, tabOrder } = useInitStore.getState();

  // Get all data from the stores
  const tabsArray = await tx.objectStore(TAB_TABLE_NAME).getAll();
  const sqlScriptsArray = await tx.objectStore(SQL_SCRIPT_TABLE_NAME).getAll();
  let contentViewCursor = await tx.objectStore(CONTENT_VIEW_TABLE_NAME).openCursor();

  while (contentViewCursor) {
    const { key, value } = contentViewCursor;
    switch (key) {
      case 'activeTabId':
        activeTabId = value as TabId;
        break;
      case 'previewTabId':
        previewTabId = value as TabId;
        break;
      case 'tabOrder':
        tabOrder = value as TabId[];
        break;
    }
    contentViewCursor = await contentViewCursor.continue();
  }
  await tx.done;

  // Convert data to the appropriate types
  const sqlScripts = new Map(sqlScriptsArray.map((script) => [script.id, script]));
  const tabs = new Map(tabsArray.map((tab) => [tab.id, tab]));

  // Finally update the store with the hydrated data
  useInitStore.setState({
    iDbConn: db,
    tabs,
    sqlScripts,
    activeTabId,
    previewTabId,
    tabOrder,
  });
};

export const resetAppData = async (db: IDBPDatabase<AppIdbSchema>) => {
  const tx = db.transaction(ALL_TABLES, 'readwrite');

  // Clear all data from the stores
  await Promise.all(ALL_TABLES.map((tableName) => tx.objectStore(tableName).clear()));
  await tx.done;
};
