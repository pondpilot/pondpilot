// Async functions to persist file system data to indexedDB.
// These are necessary when multi-table transactions are needed,
// as we are not blocking controller operations on indexedDB updates.

import { IDBPDatabase } from 'idb';
import { AnyDataSource, PersistentDataSourceId } from '@models/data-source';
import { LocalEntry, LocalEntryId } from '@models/file-system';

import {
  AppIdbSchema,
  DATA_SOURCE_TABLE_NAME,
  LOCAL_ENTRY_TABLE_NAME,
} from '@models/persisted-store';

/**
 * ------------------------------------------------------------
 * -------------------------- Create --------------------------
 * ------------------------------------------------------------
 */

export const persistAddLocalEntry = async (
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

export const persistDeleteLocalEntry = async (
  iDb: IDBPDatabase<AppIdbSchema>,
  entryIdsToDelete: Iterable<LocalEntryId>,
) => {
  const tx = iDb.transaction([LOCAL_ENTRY_TABLE_NAME], 'readwrite');

  // Delete each local entry
  const entryStore = tx.objectStore(LOCAL_ENTRY_TABLE_NAME);
  for (const id of entryIdsToDelete) {
    await entryStore.delete(id);
  }

  // Commit the transaction
  await tx.done;
};
