// Async functions to persist data source data to indexedDB.
// These are necessary when multi-table transactions are needed,
// as we are not blocking controller operations on indexedDB updates.

import { PersistentDataSourceId, AnyDataSource } from '@models/data-source';
import { LocalEntryId } from '@models/file-system';
import {
  AppIdbSchema,
  DATA_SOURCE_TABLE_NAME,
  LOCAL_ENTRY_TABLE_NAME,
} from '@models/persisted-store';
import { PersistenceAdapter } from '@store/persistence';
import { isTauriEnvironment } from '@utils/browser';
import { IDBPDatabase } from 'idb';

/**
 * ------------------------------------------------------------
 * -------------------------- Create --------------------------
 * ------------------------------------------------------------
 */

export const persistPutDataSources = async (
  iDbOrAdapter: IDBPDatabase<AppIdbSchema> | PersistenceAdapter,
  dataSources: Iterable<AnyDataSource>,
) => {
  if (isTauriEnvironment()) {
    const adapter = iDbOrAdapter as PersistenceAdapter;
    for (const ds of dataSources) {
      await adapter.put(DATA_SOURCE_TABLE_NAME, ds, ds.id);
    }
  } else {
    const iDb = iDbOrAdapter as IDBPDatabase<AppIdbSchema>;
    const tx = iDb.transaction([DATA_SOURCE_TABLE_NAME], 'readwrite');

    // Replace data sources
    const dataSourceStore = tx.objectStore(DATA_SOURCE_TABLE_NAME);
    for (const ds of dataSources) {
      await dataSourceStore.put(ds, ds.id);
    }

    // Commit the transaction
    await tx.done;
  }
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

export const persistDeleteDataSource = async (
  iDbOrAdapter: IDBPDatabase<AppIdbSchema> | PersistenceAdapter,
  deletedDataSourceIds: Iterable<PersistentDataSourceId>,
  entryIdsToDelete: Iterable<LocalEntryId>,
) => {
  if (isTauriEnvironment()) {
    // Using persistence adapter (Tauri/SQLite)
    const adapter = iDbOrAdapter as PersistenceAdapter;

    // Delete each data source
    for (const id of deletedDataSourceIds) {
      await adapter.delete(DATA_SOURCE_TABLE_NAME, id);
    }

    // Delete each local entry
    for (const id of entryIdsToDelete) {
      await adapter.delete(LOCAL_ENTRY_TABLE_NAME, id);
    }
  } else {
    // Using IndexedDB directly (web)
    const iDb = iDbOrAdapter as IDBPDatabase<AppIdbSchema>;
    const tx = iDb.transaction([DATA_SOURCE_TABLE_NAME, LOCAL_ENTRY_TABLE_NAME], 'readwrite');

    // Delete each data source
    const dataSourceStore = tx.objectStore(DATA_SOURCE_TABLE_NAME);
    for (const id of deletedDataSourceIds) {
      await dataSourceStore.delete(id);
    }

    // Delete each local entry
    const localEntryStore = tx.objectStore(LOCAL_ENTRY_TABLE_NAME);
    for (const id of entryIdsToDelete) {
      await localEntryStore.delete(id);
    }

    // Commit the transaction
    await tx.done;
  }
};
