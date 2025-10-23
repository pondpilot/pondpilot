import { persistDeleteDataSource, persistPutDataSources } from '@controllers/data-source/persist';
import {
  registerAndAttachDatabase,
  registerFileHandle,
  registerFileSourceAndCreateView,
  createXlsxSheetView,
  dropViewAndUnregisterFile,
} from '@controllers/db/data-source';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { persistAddLocalEntry } from '@controllers/file-system/persist';
import { persistDeleteTab } from '@controllers/tab/persist';
import { deleteTabImpl } from '@controllers/tab/pure';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import {
  AnyDataSource,
  AnyFlatFileDataSource,
  PersistentDataSourceId,
  XlsxSheetView,
  RemoteDB,
  LocalDB,
  SYSTEM_DATABASE_ID,
  SYSTEM_DATABASE_NAME,
  SYSTEM_DATABASE_FILE_SOURCE_ID,
} from '@models/data-source';
import {
  ignoredFolders,
  LocalEntry,
  LocalEntryId,
  LocalEntryPersistence,
  LocalFile,
  LocalFolder,
} from '@models/file-system';
import {
  ALL_TABLE_NAMES,
  APP_DB_NAME,
  CONTENT_VIEW_TABLE_NAME,
  DATA_SOURCE_ACCESS_TIME_TABLE_NAME,
  DATA_SOURCE_TABLE_NAME,
  DB_VERSION,
  LOCAL_ENTRY_TABLE_NAME,
  SCRIPT_ACCESS_TIME_TABLE_NAME,
  SQL_SCRIPT_TABLE_NAME,
  TAB_TABLE_NAME,
  TABLE_ACCESS_TIME_TABLE_NAME,
  AppIdbSchema,
} from '@models/persisted-store';
import { SQLScriptId } from '@models/sql-script';
import { TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { addLocalDB, addFlatFileDataSource, addXlsxSheetDataSource } from '@utils/data-source';
import {
  collectFileHandlePersmissions,
  isAvailableFileHandle,
  localEntryFromHandle,
  requestFileHandlePersmissions,
} from '@utils/file-system';
import { fileSystemService } from '@utils/file-system-adapter';
import { findUniqueName } from '@utils/helpers';
import { getXlsxSheetNames } from '@utils/xlsx';
import { IDBPDatabase, openDB } from 'idb';

async function getAppDataDBConnection(): Promise<IDBPDatabase<AppIdbSchema>> {
  return openDB<AppIdbSchema>(APP_DB_NAME, DB_VERSION, {
    upgrade(newDb, _oldVersion, _newVersion, _transaction) {
      // Create object stores that don't exist yet
      for (const storeName of ALL_TABLE_NAMES) {
        if (!newDb.objectStoreNames.contains(storeName)) {
          newDb.createObjectStore(storeName);
        }
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
    const existingEntry = existingChildren.find((entry) =>
      entry.kind === 'file'
        ? `${entry.name}.${entry.ext}`.toLowerCase() === name.toLowerCase()
        : entry.name === name,
    );

    if (!existingEntry) {
      // If we don't have this entry in our persistent map, we need to create a new one

      const localEntry = localEntryFromHandle(
        handle,
        directory.id,
        false, // Not directly added by the user
        handle.kind === 'file' ? getUniqueAlias : () => name,
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
          if (Array.from(resultMap.values()).some((entry) => entry.parentId === localEntry.id)) {
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
      if (Array.from(resultMap.values()).some((entry) => entry.parentId === subDirectory.id)) {
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
        handle.kind === 'file' ? getUniqueAlias : () => name,
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
          if (Array.from(resultMap.values()).some((entry) => entry.parentId === newEntry.id)) {
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
  const availableHandles: FileSystemHandle[] = [];
  for (const handle of grantedHandles) {
    if (await isAvailableFileHandle(handle)) {
      availableHandles.push(handle);
    } else {
      removedFileHandles.push(handle);
    }
  }

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
      if (entry.userAdded) {
        rootEntries.push(entry as LocalEntry);
      }
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
      if (Array.from(resultMap.values()).some((entry) => entry.parentId === rootEntry.id)) {
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
  // Migration: Extract lastUsed from scripts and move to separate access time table
  // Use incremental offsets to preserve relative ordering of legacy items
  const now = Date.now();

  // Legacy type for migration - old SQLScript may have lastUsed property
  type LegacySQLScript = { lastUsed?: number; [key: string]: any };

  const sqlScripts = new Map(
    sqlScriptsArray.map((script) => {
      const { lastUsed: _lastUsed, ...scriptWithoutLastUsed } = script as LegacySQLScript;
      return [script.id, scriptWithoutLastUsed];
    }),
  );

  const tabsArray = await tx.objectStore(TAB_TABLE_NAME).getAll();
  const tabs = new Map(tabsArray.map((tab) => [tab.id, tab]));

  const dataSourceStore = tx.objectStore(DATA_SOURCE_TABLE_NAME);
  const dataSourcesArray = await dataSourceStore.getAll();

  // Legacy type for migration - old DataSource may have lastUsed property
  type LegacyDataSource = { lastUsed?: number; [key: string]: any };

  // Migration: Extract lastUsed from data sources and move to separate access time table
  let dataSources = new Map(
    dataSourcesArray.map((dv) => {
      const { lastUsed: _lastUsed, ...dataSourceWithoutLastUsed } = dv as LegacyDataSource;
      return [dv.id, dataSourceWithoutLastUsed];
    }),
  );
  const dataSourceByLocalEntryId = new Map<LocalEntryId, AnyDataSource>(
    dataSourcesArray
      .filter((dv) => 'fileSourceId' in dv)
      .map((dv) => [(dv as any).fileSourceId, dv]),
  );

  // Load access time tables with migration from old lastUsed properties
  const dataSourceAccessTimes = new Map<PersistentDataSourceId, number>();
  try {
    const dataSourceAccessTimeStore = tx.objectStore(DATA_SOURCE_ACCESS_TIME_TABLE_NAME);
    const values = await dataSourceAccessTimeStore.getAll();
    const keys = await dataSourceAccessTimeStore.getAllKeys();
    keys.forEach((key, index) => dataSourceAccessTimes.set(key, values[index]));
  } catch (error) {
    // Table doesn't exist yet (migration from v2), extract from old lastUsed properties
    // This is expected during migration from database version 2 to 3
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      // eslint-disable-next-line no-console
      console.info('Migrating data source access times from legacy lastUsed properties');
    } else {
      // eslint-disable-next-line no-console
      console.warn('Error loading data source access times, falling back to migration:', error);
    }
    dataSourcesArray.forEach((dv, index) => {
      const legacyDs = dv as LegacyDataSource;
      const lastUsed =
        legacyDs.lastUsed ??
        (dv.type === 'remote-db' ? dv.attachedAt : now - dataSourcesArray.length + index);
      dataSourceAccessTimes.set(dv.id, lastUsed);
    });
  }

  const scriptAccessTimes = new Map<SQLScriptId, number>();
  try {
    const scriptAccessTimeStore = tx.objectStore(SCRIPT_ACCESS_TIME_TABLE_NAME);
    const values = await scriptAccessTimeStore.getAll();
    const keys = await scriptAccessTimeStore.getAllKeys();
    keys.forEach((key, index) => scriptAccessTimes.set(key, values[index]));
  } catch (error) {
    // Table doesn't exist yet (migration from v2), extract from old lastUsed properties
    // This is expected during migration from database version 2 to 3
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      // eslint-disable-next-line no-console
      console.info('Migrating script access times from legacy lastUsed properties');
    } else {
      // eslint-disable-next-line no-console
      console.warn('Error loading script access times, falling back to migration:', error);
    }
    sqlScriptsArray.forEach((script, index) => {
      const legacyScript = script as LegacySQLScript;
      const lastUsed = legacyScript.lastUsed ?? now - sqlScriptsArray.length + index;
      scriptAccessTimes.set(script.id, lastUsed);
    });
  }

  const tableAccessTimes = new Map<string, number>();
  try {
    const tableAccessTimesStore = tx.objectStore(TABLE_ACCESS_TIME_TABLE_NAME);
    const values = await tableAccessTimesStore.getAll();
    const keys = await tableAccessTimesStore.getAllKeys();
    keys.forEach((key, index) => tableAccessTimes.set(key, values[index]));
  } catch (error) {
    // Table doesn't exist yet - this is a new table in v3
    // Table-level tracking is optional, so an empty map is fine
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      // eslint-disable-next-line no-console
      console.info('Table access times store not found - initializing empty map');
    } else {
      // eslint-disable-next-line no-console
      console.warn('Error loading table access times, starting with empty map:', error);
    }
  }

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

  // For data source files collect all registered files
  const registeredFiles = new Map<LocalEntryId, File>();

  // Re-create data views and local db's in duckDB
  const registerPromises = Array.from(localEntriesMap.values()).map(async (localEntry) => {
    if (localEntry.kind !== 'file' || localEntry.fileType !== 'data-source') {
      return;
    }

    // Catch NotFoundError and other issues with file handles
    try {
      switch (localEntry.ext) {
        case 'duckdb': {
          // Get the existing data source for this entry
          let dataSource = dataSourceByLocalEntryId.get(localEntry.id);

          if (!dataSource || dataSource.type !== 'attached-db') {
            // This is a data corruption, but we can recover from it
            dataSource = addLocalDB(localEntry, _reservedDbs);

            // save to the map
            missingDataSources.set(dataSource.id, dataSource);
          }

          validDataSources.add(dataSource.id);

          const regFile = await registerAndAttachDatabase(
            conn,
            localEntry.handle,
            `${localEntry.uniqueAlias}.${localEntry.ext}`,
            dataSource.dbName,
          );
          registeredFiles.set(localEntry.id, regFile);
          break;
        }
        case 'xlsx': {
          // For XLSX files, we need to:
          // 1. Get the current sheet names
          // 2. Compare with stored data sources for this file
          // 3. Keep valid sheets, register missing sheets, remove deleted sheets

          const xlsxFile = await localEntry.handle.getFile();
          // Get current sheet names
          const currentSheetNames = await getXlsxSheetNames(xlsxFile);

          if (currentSheetNames.length === 0) {
            // No sheets defined in workbook, skip and remove entry
            warnings.push(`XLSX file ${localEntry.name} has no sheets.`);
            // Remove this entry from state and mark as discarded
            localEntriesMap.delete(localEntry.id);
            discardedEntries.push({ type: 'removed', entry: localEntry, reason: 'no-sheets' });
            break;
          }

          // Register the file with DuckDB
          const fileName = `${localEntry.uniqueAlias}.${localEntry.ext}`;

          // Register file handle - this may throw NotFoundError if the file no longer exists
          const regFile = await registerFileHandle(conn, localEntry.handle, fileName);
          registeredFiles.set(localEntry.id, regFile);

          // Find all data sources associated with this file
          const associatedDataSources = Array.from(dataSources.values()).filter(
            (ds) => ds.type === 'xlsx-sheet' && ds.fileSourceId === localEntry.id,
          ) as XlsxSheetView[];

          // Create a set of current sheet names for quick lookup
          const currentSheetSet = new Set(currentSheetNames);

          // Check for data sources that need to be removed (sheets no longer in the file)
          const existingDataSources = associatedDataSources.filter((ds) =>
            currentSheetSet.has(ds.sheetName),
          );

          // Find sheets that need to be added (not in existing data sources)
          const existingSheetNames = new Set(existingDataSources.map((ds) => ds.sheetName));
          const newSheets = currentSheetNames.filter((name) => !existingSheetNames.has(name));

          // Prepare to track sheet outcomes
          const succeededSheets: string[] = [];
          const skippedSheets: string[] = [];
          // Create data sources for new sheets
          for (const sheetName of newSheets) {
            const sheetDataSource = addXlsxSheetDataSource(localEntry, sheetName, _reservedViews);
            _reservedViews.add(sheetDataSource.viewName);
            missingDataSources.set(sheetDataSource.id, sheetDataSource);
            try {
              await createXlsxSheetView(conn, fileName, sheetName, sheetDataSource.viewName);
              validDataSources.add(sheetDataSource.id);
              succeededSheets.push(sheetName);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (msg.includes('No rows found')) {
                skippedSheets.push(sheetName);
                continue;
              }
              throw err;
            }
          }

          // Register existing sheets
          for (const dataSource of existingDataSources) {
            try {
              await createXlsxSheetView(conn, fileName, dataSource.sheetName, dataSource.viewName);
              validDataSources.add(dataSource.id);
              succeededSheets.push(dataSource.sheetName);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (msg.includes('No rows found')) {
                skippedSheets.push(dataSource.sheetName);
                continue;
              }
              throw err;
            }
          }
          // If no sheets had data, remove the entry completely
          if (succeededSheets.length === 0) {
            warnings.push(`XLSX file ${localEntry.name} has no data and was removed.`);
            localEntriesMap.delete(localEntry.id);
            discardedEntries.push({ type: 'removed', entry: localEntry, reason: 'no-data' });
            break;
          }
          // Warn about any skipped empty sheets
          if (skippedSheets.length > 0) {
            warnings.push(
              `Skipped empty sheets in ${localEntry.name}: ${skippedSheets.join(', ')}`,
            );
          }
          break;
        }
        default: {
          // Get the existing data source for this entry
          let dataSource = dataSourceByLocalEntryId.get(localEntry.id);

          if (!dataSource || dataSource.type === 'attached-db' || dataSource.type === 'remote-db') {
            // This is a data corruption, but we can recover from it
            dataSource = addFlatFileDataSource(localEntry, _reservedViews);
            _reservedViews.add(dataSource.viewName);

            // save to the map
            missingDataSources.set(dataSource.id, dataSource);
          }

          validDataSources.add(dataSource.id);

          // Then register the file source and create the view.
          // TODO: this may potentially fail - we should handle this case
          const regFile = await registerFileSourceAndCreateView(
            conn,
            localEntry.handle,
            localEntry.ext,
            `${localEntry.uniqueAlias}.${localEntry.ext}`,
            (dataSource as AnyFlatFileDataSource).viewName,
          );
          registeredFiles.set(localEntry.id, regFile);
          break;
        }
      }
    } catch (error) {
      // Handle errors with file handles (NotFoundError, etc.)
      console.error(`Error processing file ${localEntry.name}:`, error);

      // Add to discarded entries
      discardedEntries.push({
        type: 'error',
        entry: localEntry,
        reason: error instanceof Error ? error.message : String(error),
      });

      // Remove from local entries map
      localEntriesMap.delete(localEntry.id);

      // Add a warning
      warnings.push(
        `File ${localEntry.name} could not be accessed and was removed from the workspace.`,
      );
    }
  });

  await Promise.all(registerPromises);

  // Handle remote databases - they need to be re-attached
  const remoteDatabases = Array.from(dataSources.values()).filter(
    (ds) => ds.type === 'remote-db',
  ) as RemoteDB[];

  // We don't re-attach remote databases here because:
  // 1. They will be re-attached in reconnectRemoteDatabases() after app init
  // 2. We want to handle connection errors properly
  // Just mark them as valid so they don't get deleted
  for (const remoteDb of remoteDatabases) {
    validDataSources.add(remoteDb.id);
  }

  if (missingDataSources.size > 0) {
    // Ok, we need yet another transaction to add the missing data views
    await persistPutDataSources(iDbConn, missingDataSources.values());

    // Add missing data views to state and store
    dataSources = new Map([...dataSources, ...missingDataSources]);
  }

  // Add new local entries to persistent store
  const existingLocalEntryIds = new Set(localEntriesArray.map((entry) => entry.id));
  const newLocalEntries = Array.from(localEntriesMap.entries()).filter(
    ([id, _]) => !existingLocalEntryIds.has(id),
  );
  if (newLocalEntries.length > 0) {
    await persistAddLocalEntry(iDbConn, newLocalEntries, []);
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

  // Create the updated state for tabs
  const tabsToDelete: TabId[] = [];

  for (const [tabId, tab] of tabs.entries()) {
    if (tab.type === 'data-source') {
      if (outdatedDataSources.has(tab.dataSourceId)) {
        tabsToDelete.push(tabId);
      }
    }
  }

  let newTabs = tabs;
  let newTabOrder = tabOrder;
  let newActiveTabId = activeTabId;
  let newPreviewTabId = previewTabId;

  if (tabsToDelete.length > 0) {
    const result = deleteTabImpl({
      deleteTabIds: tabsToDelete,
      tabs,
      tabOrder,
      activeTabId,
      previewTabId,
    });

    newTabs = result.newTabs;
    newTabOrder = result.newTabOrder;
    newActiveTabId = result.newActiveTabId;
    newPreviewTabId = result.newPreviewTabId;
  }

  if (outdatedDataSources.size > 0) {
    await persistDeleteDataSource(
      iDbConn,
      outdatedDataSources,
      discardedEntries.map((entry) => entry.entry.id),
    );
  }
  if (tabsToDelete.length) {
    await persistDeleteTab(iDbConn, tabsToDelete, newActiveTabId, newPreviewTabId, newTabOrder);
  }

  // Read database meta data
  const databaseMetadata = await getDatabaseModel(conn);

  // Always add the PondPilot system database to dataSources
  // This ensures it's visible even when empty on fresh start
  if (!dataSources.has(SYSTEM_DATABASE_ID)) {
    const systemDb: LocalDB = {
      type: 'attached-db',
      id: SYSTEM_DATABASE_ID,
      dbName: SYSTEM_DATABASE_NAME,
      dbType: 'duckdb',
      fileSourceId: SYSTEM_DATABASE_FILE_SOURCE_ID,
    };
    dataSources.set(SYSTEM_DATABASE_ID, systemDb);
  }

  // Always ensure system database has metadata, even if empty
  if (!databaseMetadata.has(SYSTEM_DATABASE_NAME)) {
    databaseMetadata.set(SYSTEM_DATABASE_NAME, {
      name: SYSTEM_DATABASE_NAME,
      schemas: [
        {
          name: 'main',
          objects: [],
        },
      ],
    });
  }

  // Clean up orphaned data sources if browser doesn't support persistent file handles
  if (!fileSystemService.canPersistHandles()) {
    const orphanedDataSourceIds = new Set<PersistentDataSourceId>();
    const orphanedTabIds = new Set<TabId>();

    // Find all file-based data sources that don't have corresponding local entries
    for (const [dataSourceId, dataSource] of dataSources) {
      if (dataSource.type === 'attached-db' || dataSource.type === 'remote-db') {
        continue;
      }

      // Check if the file source exists in localEntriesMap
      if (!localEntriesMap.has(dataSource.fileSourceId)) {
        orphanedDataSourceIds.add(dataSourceId);

        // Also find tabs that reference this data source
        for (const [tabId, tab] of newTabs) {
          if (tab.type === 'data-source' && tab.dataSourceId === dataSourceId) {
            orphanedTabIds.add(tabId);
          }
        }
      }
    }

    // Remove orphaned data sources
    if (orphanedDataSourceIds.size > 0) {
      for (const dataSourceId of orphanedDataSourceIds) {
        const dataSource = dataSources.get(dataSourceId);
        if (dataSource && dataSource.type !== 'attached-db' && dataSource.type !== 'remote-db') {
          // Drop the view from DuckDB
          try {
            if (dataSource.type === 'xlsx-sheet') {
              await dropViewAndUnregisterFile(conn, dataSource.viewName, undefined);
            } else if (
              dataSource.type === 'csv' ||
              dataSource.type === 'json' ||
              dataSource.type === 'parquet'
            ) {
              await dropViewAndUnregisterFile(conn, dataSource.viewName, undefined);
            }
          } catch (error) {
            console.warn(`Failed to drop orphaned view ${dataSource.viewName}:`, error);
          }
        }
        dataSources.delete(dataSourceId);
      }

      // Persist the deletion of orphaned data sources
      await persistDeleteDataSource(iDbConn, orphanedDataSourceIds, []);
    }

    // Remove orphaned tabs
    if (orphanedTabIds.size > 0) {
      const deleteResult = deleteTabImpl({
        deleteTabIds: Array.from(orphanedTabIds),
        tabs: newTabs,
        tabOrder: newTabOrder,
        activeTabId: newActiveTabId,
        previewTabId: newPreviewTabId,
      });

      newTabs = deleteResult.newTabs;
      newTabOrder = deleteResult.newTabOrder;
      newActiveTabId = deleteResult.newActiveTabId;
      newPreviewTabId = deleteResult.newPreviewTabId;

      // Persist tab deletions
      await persistDeleteTab(
        iDbConn,
        Array.from(orphanedTabIds),
        newActiveTabId,
        newPreviewTabId,
        newTabOrder,
      );
    }

    if (orphanedDataSourceIds.size > 0 || orphanedTabIds.size > 0) {
      warnings.push(
        `Cleaned up ${orphanedDataSourceIds.size} orphaned file views and ${orphanedTabIds.size} tabs. ` +
          'Files need to be re-selected in browsers without persistent file access support.',
      );
    }
  }

  // Finally update the store with the hydrated data
  useAppStore.setState(
    {
      _iDbConn: iDbConn,
      databaseMetadata,
      dataSources,
      localEntries: localEntriesMap,
      registeredFiles,
      sqlScripts,
      tabs: newTabs,
      tabOrder: newTabOrder,
      activeTabId: newActiveTabId,
      previewTabId: newPreviewTabId,
      dataSourceAccessTimes,
      scriptAccessTimes,
      tableAccessTimes,
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
