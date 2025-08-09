// Async functions to persist tab data to indexedDB.
// These are necessary when multi-table transactions are needed,
// as we are not blocking controller operations on indexedDB updates.

import { AppIdbSchema, CONTENT_VIEW_TABLE_NAME, TAB_TABLE_NAME } from '@models/persisted-store';
import { AnyTab, TabId } from '@models/tab';
import { PersistenceAdapter } from '@store/persistence';
import { isTauriEnvironment } from '@utils/browser';
import { IDBPDatabase } from 'idb';

/**
 * ------------------------------------------------------------
 * -------------------------- Create --------------------------
 * ------------------------------------------------------------
 */

export const persistCreateTab = async (
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

/**
 * ------------------------------------------------------------
 * -------------------------- Read ---------------------------
 * ------------------------------------------------------------
 */

/**
 * ------------------------------------------------------------
 * -------------------------- Update --------------------------
 * ------------------------------------------------------------
 */

/**
 * ------------------------------------------------------------
 * -------------------------- Delete --------------------------
 * ------------------------------------------------------------
 */

export const persistDeleteTab = async (
  iDbOrAdapter: IDBPDatabase<AppIdbSchema> | PersistenceAdapter,
  deletedTabIds: TabId[],
  newActiveTabId: TabId | null,
  newPreviewTabId: TabId | null,
  newTabOrder: TabId[],
) => {
  if (isTauriEnvironment()) {
    // Using persistence adapter (Tauri/SQLite)
    const adapter = iDbOrAdapter as PersistenceAdapter;

    // Delete each tab
    for (const tabId of deletedTabIds) {
      await adapter.delete(TAB_TABLE_NAME, tabId);
    }

    // Update the content view data
    await adapter.put(CONTENT_VIEW_TABLE_NAME, newTabOrder, 'tabOrder');
    await adapter.put(CONTENT_VIEW_TABLE_NAME, newActiveTabId, 'activeTabId');
    await adapter.put(CONTENT_VIEW_TABLE_NAME, newPreviewTabId, 'previewTabId');
  } else {
    // Using IndexedDB directly (web)
    const iDb = iDbOrAdapter as IDBPDatabase<AppIdbSchema>;
    const tx = iDb.transaction([TAB_TABLE_NAME, CONTENT_VIEW_TABLE_NAME], 'readwrite');

    // Delete each tab
    const tabStore = tx.objectStore(TAB_TABLE_NAME);
    for (const tabId of deletedTabIds) {
      await tabStore.delete(tabId);
    }

    const contentViewStore = tx.objectStore(CONTENT_VIEW_TABLE_NAME);
    await contentViewStore.put(newTabOrder, 'tabOrder');
    await contentViewStore.put(newActiveTabId, 'activeTabId');
    await contentViewStore.put(newPreviewTabId, 'previewTabId');

    await tx.done;
  }
};
