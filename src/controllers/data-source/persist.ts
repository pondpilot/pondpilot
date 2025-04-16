// Async functions to persist data source data to indexedDB.
// These are necessary when multi-table transactions are needed,
// as we are not blocking controller operations on indexedDB updates.

import { IDBPDatabase } from 'idb';

import {
  AppIdbSchema,
  DATA_SOURCE_TABLE_NAME,
  LOCAL_ENTRY_TABLE_NAME,
} from '@models/persisted-store';
import { LocalEntryId } from '@models/file-system';
import { PersistentDataSourceId } from '@models/data-source';

/**
 * ------------------------------------------------------------
 * -------------------------- Create --------------------------
 * ------------------------------------------------------------
 */

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
  iDb: IDBPDatabase<AppIdbSchema>,
  deletedDataSourceIds: PersistentDataSourceId[],
  entryIdsToDelete: Iterable<LocalEntryId>,
) => {
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
};
