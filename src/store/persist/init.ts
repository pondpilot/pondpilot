import { IDBPDatabase, openDB } from 'idb';
import { TabId } from '@models/tab';
import { useInitStore } from '@store/init-store';
import {
  collectFileHandlePersmissions,
  isAvailableFileHandle,
  localEntryFromHandle,
  requestFileHandlePersmissions,
} from '@utils/file-system';
import {
  LocalEntry,
  LocalEntryId,
  LocalEntryPersistence,
  LocalFile,
  LocalFolder,
} from '@models/file-system';
import { findUniqueName, replaceSpecialChars } from '@utils/helpers';
import { AppIdbSchema } from './model';
import {
  ALL_TABLE_NAMES,
  APP_DB_NAME,
  CONTENT_VIEW_TABLE_NAME,
  DB_VERSION,
  LOCAL_ENTRY_TABLE_NAME,
  SQL_SCRIPT_TABLE_NAME,
  TAB_TABLE_NAME,
} from './const';

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
        resultMap.set(localEntry.id, localEntry);
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
      resultMap.set(subDirectory.id, subDirectory);

      // Recursively process this subdirectory
      await processDirectory(
        subDirectory,
        persistentMap,
        resultMap,
        discardedEntries,
        getUniqueAlias,
      );
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
        resultMap.set(newEntry.id, newEntry);
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
  const addToMap = (parentId: LocalEntryId, entry: LocalEntryPersistence) => {
    if (!parentToChildEntriesMap.has(parentId)) {
      parentToChildEntriesMap.set(parentId, []);
    }
    parentToChildEntriesMap.get(parentId)?.push(entry);
  };

  // And a set of all used aliases
  const usedAliases = new Set<string>();

  for (const entry of localEntriesArray) {
    if (entry.handle === null) {
      // Only add to the persistent map, but no need to check below
      addToMap(entry.id, entry);
      if (entry.kind === 'file') usedAliases.add(entry.uniqueAlias);
      continue;
    }

    // Check if the handle is in the granted or denied lists
    if (availableHandles.includes(entry.handle)) {
      rootEntries.push(entry as LocalEntry);
      addToMap(entry.id, entry);
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
    const uniqueAlias = findUniqueName(replaceSpecialChars(fileName), usedAliases.has);
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
      resultMap.set(rootEntry.id, rootEntry);

      // Recursively process this directory
      await processDirectory(
        rootEntry,
        parentToChildEntriesMap,
        resultMap,
        discardEntries,
        getUniqueAlias,
      );
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
export const hydrateAppData = async (
  onBeforeRequestFilePermission: (handles: FileSystemHandle[]) => Promise<boolean>,
): Promise<DiscardedEntry[]> => {
  const db = await getAppDataDBConnection();

  const tx = db.transaction(ALL_TABLE_NAMES, 'readwrite');

  // This will effectively fetch whatever defaults are set in the store.
  // This is a safety measure, theoretically all data should be in the DB
  // and hence re-assigned below.
  let { activeTabId, previewTabId, tabOrder } = useInitStore.getState();

  // Get all data from the stores

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

  // Restore local entries
  const localEntriesStore = tx.objectStore(LOCAL_ENTRY_TABLE_NAME);
  const localEntriesArray = await localEntriesStore.getAll();

  const [localEntriesMap, discardedEntries] = await restoreLocalEntries(
    localEntriesArray,
    onBeforeRequestFilePermission,
  );

  // Remove discarded entries from indexedDB
  for (const entry of discardedEntries) {
    await localEntriesStore.delete(entry.entry.id);
  }

  await tx.done;

  // Finally update the store with the hydrated data
  useInitStore.setState({
    _iDbConn: db,
    _localEntries: localEntriesMap,
    tabs,
    sqlScripts,
    activeTabId,
    previewTabId,
    tabOrder,
  });

  // Return the discarded entries for error reporting
  return discardedEntries;
};

export const resetAppData = async (db: IDBPDatabase<AppIdbSchema>) => {
  const tx = db.transaction(ALL_TABLE_NAMES, 'readwrite');

  // Clear all data from the stores
  await Promise.all(ALL_TABLE_NAMES.map((tableName) => tx.objectStore(tableName).clear()));
  await tx.done;
};
