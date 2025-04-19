import { IDBPDatabase, openDB } from 'idb';
import { TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import {
  collectFileHandlePersmissions,
  isAvailableFileHandle,
  localEntryFromHandle,
  requestFileHandlePersmissions,
} from '@utils/file-system';
import {
  ignoredFolders,
  LocalEntry,
  LocalEntryId,
  LocalEntryPersistence,
  LocalFile,
  LocalFolder,
} from '@models/file-system';
import { findUniqueName } from '@utils/helpers';
import { AnyDataSource, PersistentDataSourceId } from '@models/data-source';
import {
  registerAndAttachDatabase,
  registerFileSourceAndCreateView,
} from '@controllers/db/data-source';
import { addAttachedDB, addFlatFileDataSource } from '@utils/data-source';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import {
  ALL_TABLE_NAMES,
  APP_DB_NAME,
  CONTENT_VIEW_TABLE_NAME,
  DATA_SOURCE_TABLE_NAME,
  DB_VERSION,
  LOCAL_ENTRY_TABLE_NAME,
  SQL_SCRIPT_TABLE_NAME,
  TAB_TABLE_NAME,
  AppIdbSchema,
} from '@models/persisted-store';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { persistDeleteDataSource } from '@controllers/data-source/persist';

async function getAppDataDBConnection(): Promise<IDBPDatabase<AppIdbSchema>> {
  return openDB<AppIdbSchema>(APP_DB_NAME, DB_VERSION, {
    upgrade(newDb) {
      for (const storeName of ALL_TABLE_NAMES) {
        newDb.createObjectStore(storeName);
      }
    },
  });
}

type DiscardedEntry = {
  entry: LocalEntryPersistence;
  type: 'denied' | 'removed' | 'error' | 'warning';
  reason: string;
};

function createDiscardedEntryFromRemoved(entry: LocalEntryPersistence): DiscardedEntry {
  return {
    entry,
    type: 'removed',
    reason: entry.kind === 'directory' ? 'Folder is missing' : 'File is missing',
  };
}

// Helper function to mark an entire directory subtree as discarded
function markDirectorySubtreeAsDiscarded(
  directoryId: LocalEntryId,
  persistentMap: Map<LocalEntryId, LocalEntryPersistence[]>,
  discardedEntries: DiscardedEntry[],
): void {
  const stack: LocalEntryId[] = [directoryId];
  const visited = new Set<LocalEntryId>();

  while (stack.length > 0) {
    const currentId = stack.pop()!;

    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const children = persistentMap.get(currentId) || [];

    for (const entry of children) {
      discardedEntries.push(createDiscardedEntryFromRemoved(entry));

      if (entry.kind === 'directory') {
        stack.push(entry.id);
      }
    }
  }
}

// Helper function to process a directory and its contents
async function processDirectory(
  directory: LocalFolder,
  persistentMap: Map<LocalEntryId, LocalEntryPersistence[]>,
  resultMap: Map<LocalEntryId, LocalEntry>,
  discardedEntries: DiscardedEntry[],
  getUniqueAlias: (name: string) => string,
): Promise<void> {
  const directoryHandle = directory.handle;

  const existingChildren = persistentMap.get(directory.id) || [];
  const foundEntryIds = new Set<LocalEntryId>();

  // Get all entries in the directory
  for await (const [name, handle] of directoryHandle.entries()) {
    if (handle.kind === 'directory' && ignoredFolders.has(name.toUpperCase())) {
      continue;
    }

    // Try to find if this entry exists in our persistent map
    const existingEntry = existingChildren.find((entry) => entry.name === name);

    if (!existingEntry) {
      // If we don't have this entry in our persistent map, we need to create a new one

      const localEntry = localEntryFromHandle(
        handle,
        directory.id,
        false, // Not directly added by the user
        getUniqueAlias,
      );

      if (localEntry) {
        // If we have a valid local entry, add it to the result map
        if (localEntry.kind === 'directory') {
          // Recursively process this subdirectory
          await processDirectory(
            localEntry,
            persistentMap,
            resultMap,
            discardedEntries,
            getUniqueAlias,
          );
          // Skip empty folders
          if (resultMap.values().some((entry) => entry.parentId === localEntry.id)) {
            resultMap.set(localEntry.id, localEntry);
          }
        } else {
          resultMap.set(localEntry.id, localEntry);
        }
      }
      continue;
    }

    // If we have this entry in our persistent map, we need to do merging & checks
    foundEntryIds.add(existingEntry.id);

    if (handle.kind === 'file' && existingEntry.kind === 'file') {
      // If we have this file in our persistent map, use its data, but update the handle
      const file: LocalFile = {
        ...existingEntry,
        handle,
      };
      resultMap.set(file.id, file);
    } else if (handle.kind === 'directory' && existingEntry.kind === 'directory') {
      // If we have this directory in our persistent map, use its data
      const subDirectory: LocalFolder = {
        ...existingEntry,
        handle,
      };

      // Recursively process this subdirectory
      await processDirectory(
        subDirectory,
        persistentMap,
        resultMap,
        discardedEntries,
        getUniqueAlias,
      );
      // Skip empty folders
      if (resultMap.values().some((entry) => entry.parentId === subDirectory.id)) {
        resultMap.set(subDirectory.id, subDirectory);
      }
    } else {
      // If the handle kind has changed, we need to mark this entry as mismatched,
      // to discard the old one and then create a new one
      discardedEntries.push({
        entry: existingEntry,
        type: 'warning',
        reason: 'Stored file or folder changed type on disk',
      });

      // Create a new entry based on the current handle
      const newEntry = localEntryFromHandle(
        handle,
        directory.id,
        false, // Not directly added by the user
        getUniqueAlias,
      );

      if (newEntry) {
        // If we have a valid local entry, add it to the result map
        if (newEntry.kind === 'directory') {
          // Recursively process this subdirectory
          await processDirectory(
            newEntry,
            persistentMap,
            resultMap,
            discardedEntries,
            getUniqueAlias,
          );
          // Skip empty folders
          if (resultMap.values().some((entry) => entry.parentId === newEntry.id)) {
            resultMap.set(newEntry.id, newEntry);
          }
        } else {
          resultMap.set(newEntry.id, newEntry);
        }
      }
    }
  }

  // Check for entries that are in our persistent map but not found in the directory
  for (const entry of existingChildren) {
    if (!foundEntryIds.has(entry.id)) {
      // Mark this entry as removed
      discardedEntries.push(createDiscardedEntryFromRemoved(entry));

      if (entry.kind === 'directory') {
        // For missing directories, we need to mark the entire subtree as removed
        markDirectorySubtreeAsDiscarded(entry.id, persistentMap, discardedEntries);
      }
    }
  }
}

async function restoreLocalEntries(
  localEntriesArray: LocalEntryPersistence[],
  onBeforeRequestFilePermission: (handles: FileSystemHandle[]) => Promise<boolean>,
): Promise<[Map<LocalEntryId, LocalEntry>, DiscardedEntry[]]> {
  // So this is essentially a dfs traversal, starting from "roots", i.e. entries
  // for which we stored the handle (directly added via file picker).
  // Root files are super easy, we just add them to the map. But everything else
  // is tricky. We recursively read all entires in a folder, finding all files
  // for which we had a stored entry (so we could retain our ids) + adding new ones
  // + tracking removed ones.

  // First, find all root entries (those with stored handles) and classify them
  const { errorHandles, grantedHandles, deniedHandles, promptHandles } =
    await collectFileHandlePersmissions(
      localEntriesArray.map((entry) => entry.handle).filter((handle) => handle !== null),
    );

  // We will report errors and remove denied handles i the caller, but first we
  // need to re-request permissions for the prompt handles and get the final list of roots

  // Check if the caller wants to request permissions for the prompt handles
  if (promptHandles.length > 0 && !(await onBeforeRequestFilePermission(promptHandles))) {
    // If the caller doesn't want to request permissions, we can just consider the prompt handles
    // as denied...
    deniedHandles.push(...promptHandles);
    promptHandles.length = 0;
  }

  // Request permissions for the prompt handles (if any)
  const {
    errorHandles: reqErrorHandles,
    grantedHandles: reqGrantedHandles,
    deniedHandles: reqDeniedHandles,
  } = await requestFileHandlePersmissions(promptHandles);

  // Combine the results
  errorHandles.push(...reqErrorHandles);
  grantedHandles.push(...reqGrantedHandles);
  deniedHandles.push(...reqDeniedHandles);

  // And one last check for the granted handles (files) - are they still available?
  const removedFileHandles: FileSystemHandle[] = [];
  const availableHandles = grantedHandles.filter(async (handle) => {
    if (!(await isAvailableFileHandle(handle))) {
      removedFileHandles.push(handle);
      return false;
    }
    return true;
  });

  // Map back from handles to entries
  const discardEntries: DiscardedEntry[] = [];
  const rootEntries: LocalEntry[] = [];

  // Also build a map from parentId to children, we'll do a lot of lookups on this.
  const parentToChildEntriesMap: Map<LocalEntryId, LocalEntryPersistence[]> = new Map();
  const addToMap = (entry: LocalEntryPersistence) => {
    if (!entry.parentId) {
      return;
    }
    if (!parentToChildEntriesMap.has(entry.parentId)) {
      parentToChildEntriesMap.set(entry.parentId, []);
    }
    parentToChildEntriesMap.get(entry.parentId)?.push(entry);
  };

  // And a set of all used aliases
  const usedAliases = new Set<string>();

  for (const entry of localEntriesArray) {
    if (entry.handle === null) {
      // Only add to the persistent map, but no need to check below
      addToMap(entry);
      if (entry.kind === 'file') usedAliases.add(entry.uniqueAlias);
      continue;
    }

    // Check if the handle is in the granted or denied lists
    if (availableHandles.includes(entry.handle)) {
      rootEntries.push(entry as LocalEntry);
      addToMap(entry);
      if (entry.kind === 'file') usedAliases.add(entry.uniqueAlias);
    } else if (deniedHandles.includes(entry.handle)) {
      discardEntries.push({
        entry,
        type: 'denied',
        reason: 'Permission denied',
      });
    } else if (removedFileHandles.includes(entry.handle)) {
      discardEntries.push({
        entry,
        type: 'removed',
        reason: 'File is not available',
      });
    } else if (errorHandles.some((errorHandle) => errorHandle.handle === entry.handle)) {
      const errorHandle = errorHandles.find((error) => error.handle === entry.handle);
      discardEntries.push({
        entry,
        type: 'error',
        reason: errorHandle ? errorHandle.reason : 'Unknown error',
      });
    }
  }

  const getUniqueAlias = (fileName: string): string => {
    const uniqueAlias = findUniqueName(fileName, (name: string) => usedAliases.has(name));
    usedAliases.add(uniqueAlias);
    return uniqueAlias;
  };

  // Now we have the root entries with permissions granted and we finally can get to our DFS

  // Create an empty map to store the hydrated local entries
  const resultMap = new Map<LocalEntryId, LocalEntry>();

  // Process each root entry
  for (const rootEntry of rootEntries) {
    if (rootEntry.kind === 'file') {
      // For files, just add them to the map with their handle
      resultMap.set(rootEntry.id, rootEntry);
    } else if (rootEntry.kind === 'directory') {
      // For directories, add them to the map and then process their contents
      // Recursively process this directory
      await processDirectory(
        rootEntry,
        parentToChildEntriesMap,
        resultMap,
        discardEntries,
        getUniqueAlias,
      );
      // Skip empty folders
      if (resultMap.values().some((entry) => entry.parentId === rootEntry.id)) {
        resultMap.set(rootEntry.id, rootEntry);
      } else {
        discardEntries.push({
          entry: rootEntry,
          type: 'warning',
          reason: 'Stored folder is empty',
        });
      }
    }
  }

  return [resultMap, discardEntries];
}

/**
 * Hydrates the app data from IndexedDB into the store.
 *
 * This is not a hook, so can be used anywhere in the app.
 *
 * @returns {Promise<void>} A promise that resolves when the data is hydrated.
 */
export const restoreAppDataFromIDB = async (
  conn: AsyncDuckDBConnectionPool,
  onBeforeRequestFilePermission: (handles: FileSystemHandle[]) => Promise<boolean>,
): Promise<{ discardedEntries: DiscardedEntry[]; warnings: string[] }> => {
  const iDbConn = await getAppDataDBConnection();

  const warnings: string[] = [];
  // iDB doesn't allow holding transaction while we await something
  // except iDB operation, so we have to use multiple separate ones...

  // Restore local entries in a separate transaction.
  const localEntriesArray = await iDbConn.getAll(LOCAL_ENTRY_TABLE_NAME);

  const [localEntriesMap, discardedEntries] = await restoreLocalEntries(
    localEntriesArray,
    onBeforeRequestFilePermission,
  );

  if (discardedEntries.length > 0) {
    const deleteTx = iDbConn.transaction(LOCAL_ENTRY_TABLE_NAME, 'readwrite');

    // Remove discarded entries from indexedDB
    for (const entry of discardedEntries) {
      await deleteTx.store.delete(entry.entry.id);
    }

    await deleteTx.done;
  }

  // Now a big transaction to pull most of the data
  const tx = iDbConn.transaction(ALL_TABLE_NAMES, 'readonly');

  // This will effectively fetch whatever defaults are set in the store.
  // This is a safety measure, theoretically all data should be in the DB
  // and hence re-assigned below.
  let { activeTabId, previewTabId, tabOrder } = useAppStore.getState();

  // Restore configuration data
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

  // Read & Convert data to the appropriate types
  const sqlScriptsArray = await tx.objectStore(SQL_SCRIPT_TABLE_NAME).getAll();
  const sqlScripts = new Map(sqlScriptsArray.map((script) => [script.id, script]));

  const tabsArray = await tx.objectStore(TAB_TABLE_NAME).getAll();
  const tabs = new Map(tabsArray.map((tab) => [tab.id, tab]));

  const dataSourceStore = tx.objectStore(DATA_SOURCE_TABLE_NAME);
  const dataSourcesArray = await dataSourceStore.getAll();
  let dataSources = new Map(dataSourcesArray.map((dv) => [dv.id, dv]));
  const dataSourceByLocalEntryId = new Map<LocalEntryId, AnyDataSource>(
    dataSourcesArray.map((dv) => [dv.fileSourceId, dv]),
  );

  await tx.done;

  // The following mirrors the logic for adding new data sources.
  // In reality currently our database is created from scratch, so it
  // should be impossible to have duplicates during restore. But
  // our shared api's require a set to be passed in so...
  const _reservedViews = new Set([] as string[]);
  const _reservedDbs = new Set([] as string[]);

  // TODO: Check for tabs that are missing associated data views/scripts and rop them
  // with some user warning

  // Normally we should have all data sources in the store, but we allow recovering
  // from this specific inconsistency, as it is pretty easy to re-create them.
  // Except of course, none of the tabs may be using them as we generate new ids
  const missingDataSources: Map<PersistentDataSourceId, AnyDataSource> = new Map();
  const validDataSources = new Set<PersistentDataSourceId>();

  // Re-create data views and attached db's in duckDB
  await Promise.all(
    localEntriesMap.values().map(async (localEntry) => {
      if (localEntry.kind !== 'file' || localEntry.fileType !== 'data-source') {
        return;
      }
      switch (localEntry.ext) {
        case 'duckdb': {
          // Get the existing data source for this entry
          let dataSource = dataSourceByLocalEntryId.get(localEntry.id);

          if (!dataSource || dataSource.type !== 'attached-db') {
            // This is a data corruption, but we can recover from it
            dataSource = addAttachedDB(localEntry, _reservedDbs);

            // save to the map
            missingDataSources.set(dataSource.id, dataSource);
          }

          validDataSources.add(dataSource.id);

          await registerAndAttachDatabase(
            conn,
            localEntry.handle,
            `${localEntry.uniqueAlias}.${localEntry.ext}`,
            dataSource.dbName,
          );
          break;
        }
        case 'xlsx': {
          throw new Error('TODO: implement xlsx-sheet data source restore');
        }
        default: {
          // Get the existing data source for this entry
          let dataSource = dataSourceByLocalEntryId.get(localEntry.id);

          if (!dataSource || dataSource.type === 'attached-db') {
            // This is a data corruption, but we can recover from it
            dataSource = addFlatFileDataSource(localEntry, _reservedViews);

            // save to the map
            missingDataSources.set(dataSource.id, dataSource);
          }

          validDataSources.add(dataSource.id);

          // Then register the file source and create the view.
          // TODO: this may potentially fail - we should handle this case
          await registerFileSourceAndCreateView(
            conn,
            localEntry.handle,
            `${localEntry.uniqueAlias}.${localEntry.ext}`,
            dataSource.viewName,
          );
          break;
        }
      }
    }),
  );

  if (missingDataSources.size > 0) {
    // Ok, we need yet another transaction to add the missing data views
    const missingDataViewsTx = iDbConn.transaction(DATA_SOURCE_TABLE_NAME, 'readwrite');

    // Add missing data views to state and store
    dataSources = new Map([...dataSources, ...missingDataSources]);

    for (const [id, dv] of missingDataSources) {
      await missingDataViewsTx.store.add(dv, id);
    }

    await missingDataViewsTx.done;
  }

  // Delete outdated data sources
  const outdatedDataSources = new Set<PersistentDataSourceId>();
  for (const ds of Array.from(dataSources.values())) {
    if (validDataSources.has(ds.id)) {
      continue;
    }
    dataSources.delete(ds.id);
    outdatedDataSources.add(ds.id);
  }

  if (outdatedDataSources.size > 0) {
    await persistDeleteDataSource(iDbConn, outdatedDataSources, []);
  }

  // Read database meta data
  const dataBaseMetadata = await getDatabaseModel(conn);

  // Finally update the store with the hydrated data
  useAppStore.setState(
    {
      _iDbConn: iDbConn,
      activeTabId,
      dataBaseMetadata,
      dataSources,
      localEntries: localEntriesMap,
      previewTabId,
      sqlScripts,
      tabOrder,
      tabs,
    },
    undefined,
    'AppStore/restoreAppDataFromIDB',
  );

  // Return the discarded entries for error reporting
  return { discardedEntries, warnings };
};

export const resetAppData = async (db: IDBPDatabase<AppIdbSchema>) => {
  const tx = db.transaction(ALL_TABLE_NAMES, 'readwrite');

  // Clear all data from the stores
  await Promise.all(ALL_TABLE_NAMES.map((tableName) => tx.objectStore(tableName).clear()));
  await tx.done;
};
