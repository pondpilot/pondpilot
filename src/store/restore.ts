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
import { Comparison, ComparisonId } from '@models/comparison';
import {
  AnyDataSource,
  AnyFlatFileDataSource,
  IcebergCatalog,
  PersistentDataSourceId,
  XlsxSheetView,
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
import { Notebook, NotebookId } from '@models/notebook';
import {
  ALL_TABLE_NAMES,
  APP_DB_NAME,
  COMPARISON_TABLE_NAME,
  CONTENT_VIEW_TABLE_NAME,
  DATA_SOURCE_ACCESS_TIME_TABLE_NAME,
  DATA_SOURCE_TABLE_NAME,
  DB_VERSION,
  LOCAL_ENTRY_TABLE_NAME,
  NOTEBOOK_TABLE_NAME,
  NOTEBOOK_ACCESS_TIME_TABLE_NAME,
  SCRIPT_ACCESS_TIME_TABLE_NAME,
  SQL_SCRIPT_TABLE_NAME,
  SCRIPT_VERSION_TABLE_NAME,
  TAB_TABLE_NAME,
  TABLE_ACCESS_TIME_TABLE_NAME,
  AppIdbSchema,
} from '@models/persisted-store';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { ComparisonTab, TabId } from '@models/tab';
import { makeSecretId, putSecret } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { makeComparisonId } from '@utils/comparison';
import {
  addLocalDB,
  addFlatFileDataSource,
  addXlsxSheetDataSource,
  isDatabaseDataSource,
  isFlatFileDataSource,
} from '@utils/data-source';
import {
  collectFileHandlePersmissions,
  isAvailableFileHandle,
  localEntryFromHandle,
  requestFileHandlePersmissions,
} from '@utils/file-system';
import { fileSystemService } from '@utils/file-system-adapter';
import { findUniqueName } from '@utils/helpers';
import { buildIcebergSecretPayload } from '@utils/iceberg-catalog';
import { getXlsxSheetNames } from '@utils/xlsx';
import { IDBPDatabase, openDB } from 'idb';

async function getAppDataDBConnection(): Promise<IDBPDatabase<AppIdbSchema>> {
  return openDB<AppIdbSchema>(APP_DB_NAME, DB_VERSION, {
    upgrade: async (newDb, oldVersion, _newVersion, transaction) => {
      // Create all tables that don't exist yet
      for (const storeName of ALL_TABLE_NAMES) {
        if (!newDb.objectStoreNames.contains(storeName)) {
          if (storeName === SCRIPT_VERSION_TABLE_NAME) {
            const store = newDb.createObjectStore(storeName, { keyPath: 'id' });
            store.createIndex('by-script', 'scriptId', { unique: false });
          } else {
            newDb.createObjectStore(storeName);
          }
        }
      }

      // Migration to version 3: add access time tracking
      if (oldVersion < 3) {
        const now = Date.now();
        const dataSourceStore = transaction.objectStore(DATA_SOURCE_TABLE_NAME);
        const dataSourceAccessStore = transaction.objectStore(DATA_SOURCE_ACCESS_TIME_TABLE_NAME);
        const scriptStore = transaction.objectStore(SQL_SCRIPT_TABLE_NAME);
        const scriptAccessStore = transaction.objectStore(SCRIPT_ACCESS_TIME_TABLE_NAME);

        const dataSourcesArray = await dataSourceStore.getAll();
        dataSourcesArray.forEach((dv, index) => {
          const legacyDataSource = dv as { lastUsed?: number };
          const lastUsed =
            legacyDataSource.lastUsed ??
            (dv.type === 'remote-db' ? dv.attachedAt : now - dataSourcesArray.length + index);
          dataSourceAccessStore.put(lastUsed, dv.id);
        });

        const sqlScriptsArray = await scriptStore.getAll();
        sqlScriptsArray.forEach((script, index) => {
          const legacyScript = script as { lastUsed?: number };
          const lastUsed = legacyScript.lastUsed ?? now - sqlScriptsArray.length + index;
          scriptAccessStore.put(lastUsed, script.id);
        });
      }

      // Migration to version 4: add script version table with index
      // The table and index are created in the loop above (via special handling
      // for SCRIPT_VERSION_TABLE_NAME which creates the store with keyPath and index)
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

  // Initialize AI config from the encrypted secret store (or migrate from cookie).
  // This must happen before reconnection triggers any `getAIConfig()` calls.
  // Dynamic import to avoid pulling ai-service.ts (which uses import.meta) into
  // the static import graph — Jest doesn't support import.meta outside modules.
  const { initAIConfigFromSecretStore } = await import('@utils/ai-config');
  await initAIConfigFromSecretStore(iDbConn);

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
  type LegacySQLScript = SQLScript & { lastUsed?: number };
  const sqlScripts = new Map(
    sqlScriptsArray.map((script) => {
      const { lastUsed: _lastUsed, ...scriptWithoutLastUsed } = script as LegacySQLScript;
      return [script.id, scriptWithoutLastUsed as SQLScript];
    }),
  );

  // Read notebooks
  const notebooksArray = await tx.objectStore(NOTEBOOK_TABLE_NAME).getAll();
  const notebooks = new Map<NotebookId, Notebook>(
    notebooksArray.map((notebook) => [notebook.id as NotebookId, notebook as Notebook]),
  );

  const comparisonsArray = await tx.objectStore(COMPARISON_TABLE_NAME).getAll();
  const comparisons = new Map<ComparisonId, Comparison>(
    comparisonsArray.map((comparison) => [comparison.id as ComparisonId, comparison as Comparison]),
  );

  const tabsArray = await tx.objectStore(TAB_TABLE_NAME).getAll();
  const tabs = new Map<TabId, any>(tabsArray.map((tab) => [tab.id as TabId, tab]));

  const comparisonWrites: Map<ComparisonId, Comparison> = new Map();
  const tabWrites: Map<TabId, ComparisonTab> = new Map();

  // Normalize existing comparison entries to include newer persistence fields
  for (const [comparisonId, comparisonData] of comparisons.entries()) {
    const lastExecutionTime = (comparisonData as Partial<Comparison>).lastExecutionTime ?? null;
    const resultsTableName = (comparisonData as Partial<Comparison>).resultsTableName ?? null;
    const lastRunAt = (comparisonData as Partial<Comparison>).lastRunAt ?? null;

    if (
      comparisonData.lastExecutionTime !== lastExecutionTime ||
      comparisonData.resultsTableName !== resultsTableName ||
      (comparisonData as Partial<Comparison>).lastRunAt !== lastRunAt
    ) {
      const normalizedComparison: Comparison = {
        ...comparisonData,
        lastExecutionTime,
        lastRunAt,
        resultsTableName,
      };

      comparisons.set(comparisonId, normalizedComparison);
      comparisonWrites.set(comparisonId, normalizedComparison);
    }
  }

  const existingComparisonNames = new Set(
    Array.from(comparisons.values()).map((comparison) => comparison.name),
  );
  const existingScriptNames = new Set(sqlScriptsArray.map((script) => script.name));

  // Migrate legacy comparison tabs that still own their comparison data
  for (const [tabId, tabValue] of tabs.entries()) {
    if (!tabValue || tabValue.type !== 'comparison') {
      continue;
    }

    const comparisonTab = tabValue as any;

    if (comparisonTab.comparisonId) {
      // If the comparison record is missing (rare) backfill a minimal entry so the UI can list it
      if (!comparisons.has(comparisonTab.comparisonId)) {
        const fallbackName = findUniqueName(
          'Comparison',
          (value) => existingComparisonNames.has(value) || existingScriptNames.has(value),
        );

        const stubComparison: Comparison = {
          id: comparisonTab.comparisonId as ComparisonId,
          name: fallbackName,
          config: null,
          schemaComparison: null,
          lastExecutionTime: comparisonTab.lastExecutionTime ?? null,
          lastRunAt: comparisonTab.lastExecutionTime ? new Date().toISOString() : null,
          resultsTableName: comparisonTab.comparisonResultsTable ?? null,
          metadata: {
            sourceStats: null,
            partialResults: false,
            executionMetadata: null,
          },
        };

        comparisons.set(stubComparison.id, stubComparison);
        comparisonWrites.set(stubComparison.id, stubComparison);
        existingComparisonNames.add(fallbackName);
      }

      continue;
    }

    const desiredName: string = comparisonTab.name ?? 'Comparison';
    const uniqueName = findUniqueName(
      desiredName,
      (value) => existingComparisonNames.has(value) || existingScriptNames.has(value),
    );

    const comparisonId = makeComparisonId();

    const migratedComparison: Comparison = {
      id: comparisonId,
      name: uniqueName,
      config: comparisonTab.config ?? null,
      schemaComparison: comparisonTab.schemaComparison ?? null,
      lastExecutionTime: comparisonTab.lastExecutionTime ?? null,
      lastRunAt: comparisonTab.lastExecutionTime ? new Date().toISOString() : null,
      resultsTableName: comparisonTab.comparisonResultsTable ?? null,
      metadata: {
        sourceStats: null,
        partialResults: false,
        executionMetadata: null,
      },
    };

    existingComparisonNames.add(uniqueName);

    const viewingResults =
      'viewingResults' in comparisonTab
        ? Boolean(comparisonTab.viewingResults)
        : comparisonTab.wizardStep === 'results';

    const migratedTab: ComparisonTab = {
      type: 'comparison',
      id: comparisonTab.id,
      comparisonId,
      viewingResults,
      lastExecutionTime: comparisonTab.lastExecutionTime ?? null,
      comparisonResultsTable: comparisonTab.comparisonResultsTable ?? null,
      dataViewStateCache: comparisonTab.dataViewStateCache ?? null,
    };

    comparisons.set(comparisonId, migratedComparison);
    tabs.set(tabId, migratedTab);

    comparisonWrites.set(comparisonId, migratedComparison);
    tabWrites.set(tabId, migratedTab);
  }

  const dataSourceStore = tx.objectStore(DATA_SOURCE_TABLE_NAME);
  const dataSourcesArray = await dataSourceStore.getAll();
  type LegacyDataSource = AnyDataSource & { lastUsed?: number };
  let dataSources = new Map(
    dataSourcesArray.map((dv) => {
      const { lastUsed: _lastUsed, ...dataSourceWithoutLastUsed } = dv as LegacyDataSource;
      return [dv.id, dataSourceWithoutLastUsed as AnyDataSource];
    }),
  );
  const dataSourceByLocalEntryId = new Map<LocalEntryId, AnyDataSource>(
    dataSourcesArray
      .filter((dv) => 'fileSourceId' in dv)
      .map((dv) => [(dv as any).fileSourceId, dv]),
  );

  const dataSourceAccessTimes = new Map<PersistentDataSourceId, number>();
  try {
    const dataSourceAccessStore = tx.objectStore(DATA_SOURCE_ACCESS_TIME_TABLE_NAME);
    const dataSourceAccessValues = await dataSourceAccessStore.getAll();
    const dataSourceAccessKeys = await dataSourceAccessStore.getAllKeys();
    dataSourceAccessKeys.forEach((key, index) => {
      dataSourceAccessTimes.set(
        key as PersistentDataSourceId,
        dataSourceAccessValues[index] as number,
      );
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      // eslint-disable-next-line no-console
      console.info('Data source access times store not found, falling back to legacy migration');
    } else {
      // eslint-disable-next-line no-console
      console.warn('Error loading data source access times, falling back to migration:', error);
    }
    const now = Date.now();
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
    const scriptAccessStore = tx.objectStore(SCRIPT_ACCESS_TIME_TABLE_NAME);
    const scriptAccessValues = await scriptAccessStore.getAll();
    const scriptAccessKeys = await scriptAccessStore.getAllKeys();
    scriptAccessKeys.forEach((key, index) => {
      scriptAccessTimes.set(key as SQLScript['id'], scriptAccessValues[index] as number);
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      // eslint-disable-next-line no-console
      console.info('Script access times store not found, falling back to legacy migration');
    } else {
      // eslint-disable-next-line no-console
      console.warn('Error loading script access times, falling back to migration:', error);
    }
    const now = Date.now();
    sqlScriptsArray.forEach((script, index) => {
      const legacyScript = script as LegacySQLScript;
      const lastUsed = legacyScript.lastUsed ?? now - sqlScriptsArray.length + index;
      scriptAccessTimes.set(script.id, lastUsed);
    });
  }

  const tableAccessTimes = new Map<string, number>();
  try {
    const tableAccessTimesStore = tx.objectStore(TABLE_ACCESS_TIME_TABLE_NAME);
    const tableAccessValues = await tableAccessTimesStore.getAll();
    const tableAccessKeys = await tableAccessTimesStore.getAllKeys();
    tableAccessKeys.forEach((key, index) => {
      tableAccessTimes.set(key as string, tableAccessValues[index] as number);
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      // eslint-disable-next-line no-console
      console.info('Table access times store not found, initializing empty map');
    } else {
      // eslint-disable-next-line no-console
      console.warn('Error loading table access times, starting with empty map:', error);
    }
  }

  const notebookAccessTimes = new Map<NotebookId, number>();
  try {
    const notebookAccessStore = tx.objectStore(NOTEBOOK_ACCESS_TIME_TABLE_NAME);
    const notebookAccessValues = await notebookAccessStore.getAll();
    const notebookAccessKeys = await notebookAccessStore.getAllKeys();
    notebookAccessKeys.forEach((key, index) => {
      notebookAccessTimes.set(key as NotebookId, notebookAccessValues[index] as number);
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      // eslint-disable-next-line no-console
      console.info('Notebook access times store not found, initializing empty map');
    } else {
      // eslint-disable-next-line no-console
      console.warn('Error loading notebook access times, starting with empty map:', error);
    }
  }

  await tx.done;

  if (comparisonWrites.size > 0 || tabWrites.size > 0) {
    const migrationTx = iDbConn.transaction([COMPARISON_TABLE_NAME, TAB_TABLE_NAME], 'readwrite');

    const comparisonStore = migrationTx.objectStore(COMPARISON_TABLE_NAME);
    for (const comparison of comparisonWrites.values()) {
      await comparisonStore.put(comparison, comparison.id);
    }

    const tabStore = migrationTx.objectStore(TAB_TABLE_NAME);
    for (const tab of tabWrites.values()) {
      await tabStore.put(tab, tab.id);
    }

    await migrationTx.done;
  }

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

          if (!dataSource || isDatabaseDataSource(dataSource)) {
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

  // Handle remote databases and iceberg catalogs - they need to be re-attached.
  // We don't re-attach them here because:
  // 1. They will be re-attached in reconnectRemoteDatabases() after app init
  // 2. We want to handle connection errors properly
  // Just mark them as valid so they don't get deleted
  for (const ds of dataSources.values()) {
    if (ds.type === 'remote-db' || ds.type === 'iceberg-catalog') {
      validDataSources.add(ds.id);
    }
  }

  // Migrate Iceberg catalogs that have inline credentials but no secretRef
  const catalogsToMigrate: IcebergCatalog[] = [];
  for (const ds of dataSources.values()) {
    if (
      ds.type === 'iceberg-catalog' &&
      !ds.secretRef &&
      (ds.clientId || ds.clientSecret || ds.token || ds.awsKeyId || ds.awsSecret)
    ) {
      catalogsToMigrate.push(ds);
    }
  }

  for (const catalog of catalogsToMigrate) {
    try {
      const secretRef = makeSecretId();
      const payload = buildIcebergSecretPayload(`Iceberg: ${catalog.catalogAlias}`, {
        authType: catalog.authType,
        clientId: catalog.clientId,
        clientSecret: catalog.clientSecret,
        oauth2ServerUri: catalog.oauth2ServerUri,
        token: catalog.token,
        awsKeyId: catalog.awsKeyId,
        awsSecret: catalog.awsSecret,
        defaultRegion: catalog.defaultRegion,
      });
      await putSecret(iDbConn, secretRef, payload);

      const migrated: IcebergCatalog = {
        ...catalog,
        secretRef,
        clientId: undefined,
        clientSecret: undefined,
        token: undefined,
        awsKeyId: undefined,
        awsSecret: undefined,
      };

      // Persist each catalog individually so a partial batch failure
      // cannot leave catalogs with cleared inline fields but no secretRef.
      await persistPutDataSources(iDbConn, [migrated]);
      dataSources.set(catalog.id, migrated);
    } catch (error) {
      // On failure the catalog retains its inline credentials — no data loss.
      console.warn(`Failed to migrate credentials for catalog ${catalog.catalogAlias}:`, error);
    }
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
      if (isDatabaseDataSource(dataSource)) {
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
        if (dataSource && !isDatabaseDataSource(dataSource)) {
          // Drop the view from DuckDB
          try {
            if (isFlatFileDataSource(dataSource)) {
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
      notebooks,
      comparisons,
      tabs: newTabs,
      tabOrder: newTabOrder,
      activeTabId: newActiveTabId,
      previewTabId: newPreviewTabId,
      dataSourceAccessTimes,
      scriptAccessTimes,
      notebookAccessTimes,
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
