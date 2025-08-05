// Async functions to persist file system data.
// Updated to use PersistenceAdapter for both IndexedDB and SQLite (Tauri)

import { AnyDataSource, PersistentDataSourceId } from '@models/data-source';
import { LocalEntry, LocalEntryId } from '@models/file-system';
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

export const persistAddLocalEntry = async (
  iDbOrAdapter: IDBPDatabase<AppIdbSchema> | PersistenceAdapter,
  newEntries: [LocalEntryId, LocalEntry][],
  newDataSources: [PersistentDataSourceId, AnyDataSource][],
) => {
  // Check if we're using the adapter pattern
  const adapter = isTauriEnvironment() ? (iDbOrAdapter as PersistenceAdapter) : null;

  if (adapter) {
    // Using persistence adapter (Tauri/SQLite)
    // Process entries
    for (const [id, newLocalEntry] of newEntries) {
      // For Tauri, include the file path as tauriPath
      const path =
        (newLocalEntry as any).filePath ||
        (newLocalEntry as any).directoryPath ||
        (newLocalEntry.handle as any)?._tauriPath;
      const persistenceEntry = {
        ...newLocalEntry,
        handle: null, // Don't store mock handles
        tauriPath: path,
      };
      await adapter.put(LOCAL_ENTRY_TABLE_NAME, persistenceEntry, id);
    }

    // Process data sources
    for (const [id, newDataSource] of newDataSources) {
      await adapter.put(DATA_SOURCE_TABLE_NAME, newDataSource, id);
    }
  } else {
    // Using IndexedDB directly (web)
    const iDb = iDbOrAdapter as IDBPDatabase<AppIdbSchema>;
    const tx = iDb.transaction([LOCAL_ENTRY_TABLE_NAME, DATA_SOURCE_TABLE_NAME], 'readwrite');

    // Add new local entries, converting to persistence format
    for (const [id, newLocalEntry] of newEntries) {
      // Convert LocalEntry to LocalEntryPersistence
      let persistenceEntry: any;

      // Check if this is a Tauri handle with _tauriPath or has filePath
      if (
        (newLocalEntry.handle && (newLocalEntry.handle as any)._tauriPath) ||
        (newLocalEntry as any).filePath
      ) {
        // For Tauri handles, store only the path and essential properties
        persistenceEntry = {
          ...newLocalEntry,
          handle: null, // Don't store the mock handle
          tauriPath: (newLocalEntry.handle as any)?._tauriPath || (newLocalEntry as any).filePath, // Store the path separately
        };
      } else {
        // For web handles, only store if userAdded
        persistenceEntry = {
          ...newLocalEntry,
          handle: newLocalEntry.userAdded ? newLocalEntry.handle : null,
        };
      }

      await tx.objectStore(LOCAL_ENTRY_TABLE_NAME).put(persistenceEntry, id);
    }

    // Add new data sources
    for (const [id, newDataSource] of newDataSources) {
      await tx.objectStore(DATA_SOURCE_TABLE_NAME).put(newDataSource, id);
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

export const persistDeleteLocalEntry = async (
  iDbOrAdapter: IDBPDatabase<AppIdbSchema> | PersistenceAdapter,
  entryIdsToDelete: Iterable<LocalEntryId>,
) => {
  // Check if we're using the adapter pattern
  const adapter = isTauriEnvironment() ? (iDbOrAdapter as PersistenceAdapter) : null;

  if (adapter) {
    // Using persistence adapter (Tauri/SQLite)
    for (const id of entryIdsToDelete) {
      await adapter.delete(LOCAL_ENTRY_TABLE_NAME, id);
    }
  } else {
    // Using IndexedDB directly (web)
    const iDb = iDbOrAdapter as IDBPDatabase<AppIdbSchema>;
    const tx = iDb.transaction([LOCAL_ENTRY_TABLE_NAME], 'readwrite');

    // Delete each local entry
    const entryStore = tx.objectStore(LOCAL_ENTRY_TABLE_NAME);
    for (const id of entryIdsToDelete) {
      await entryStore.delete(id);
    }

    // Commit the transaction
    await tx.done;
  }
};
