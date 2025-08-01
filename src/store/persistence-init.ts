import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { ConnectionPool } from '@engines/types';
import {
  AnyDataSource,
  PersistentDataSourceId,
  LocalDB,
  SYSTEM_DATABASE_ID,
  SYSTEM_DATABASE_NAME,
  SYSTEM_DATABASE_FILE_SOURCE_ID,
} from '@models/data-source';
import { LocalEntry, LocalEntryId, supportedFlatFileDataSourceFileExt } from '@models/file-system';
import {
  LOCAL_ENTRY_TABLE_NAME,
  DATA_SOURCE_TABLE_NAME,
  SQL_SCRIPT_TABLE_NAME,
  TAB_TABLE_NAME,
} from '@models/persisted-store';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { AnyTab, TabId } from '@models/tab';
import { isTauriEnvironment } from '@utils/browser';

import { useAppStore } from './app-store';
import { PersistenceAdapter, createPersistenceAdapter } from './persistence';
import { restoreAppDataFromIDB } from './restore';

/**
 * Initialize persistence adapter and restore app data
 * This is the main entry point for app initialization
 */
export async function initializePersistence(
  conn: ConnectionPool,
  onBeforeRequestFilePermission: (handles: FileSystemHandle[]) => Promise<boolean>,
) {
  if (isTauriEnvironment()) {
    // For Tauri, create the SQLite adapter
    const adapter = createPersistenceAdapter(null);

    // Store the adapter in app state
    useAppStore.setState({ _persistenceAdapter: adapter });

    // Restore from SQLite
    return restoreAppDataFromSQLite(conn, adapter!, onBeforeRequestFilePermission);
  }
  // For web, use the existing IndexedDB restoration
  return restoreAppDataFromIDB(conn, onBeforeRequestFilePermission);
}

/**
 * Restore app data from SQLite (Tauri)
 */
async function restoreAppDataFromSQLite(
  conn: ConnectionPool,
  adapter: PersistenceAdapter,
  onBeforeRequestFilePermission: (handles: FileSystemHandle[]) => Promise<boolean>,
) {
  const warnings: string[] = [];

  // Get all data from SQLite
  const localEntriesArray = await adapter.getAll<any>(LOCAL_ENTRY_TABLE_NAME);
  const dataSourcesArray = await adapter.getAll<AnyDataSource>(DATA_SOURCE_TABLE_NAME);
  const sqlScriptsArray = await adapter.getAll<SQLScript>(SQL_SCRIPT_TABLE_NAME);
  const tabsArray = await adapter.getAll<AnyTab>(TAB_TABLE_NAME);

  // Reconstruct local entries with proper mock handles for Tauri
  const localEntries = new Map<LocalEntryId, LocalEntry>();
  for (const entryData of localEntriesArray) {
    // Check if this is a Tauri entry with a stored path
    if (entryData.tauriPath && !entryData.handle) {
      // Create a mock handle
      if (entryData.kind === 'file') {
        entryData.handle = {
          kind: 'file',
          name: `${entryData.name}${entryData.ext ? `.${entryData.ext}` : ''}`,
          getFile: async () => {
            const fs = await import('@tauri-apps/plugin-fs');
            const contents = await fs.readFile(entryData.tauriPath);
            return new File([contents], entryData.name, {
              lastModified: Date.now(),
            });
          },
          queryPermission: async () => 'granted' as PermissionState,
          requestPermission: async () => 'granted' as PermissionState,
          _tauriPath: entryData.tauriPath,
        } as any;
      } else if (entryData.kind === 'directory') {
        entryData.handle = {
          kind: 'directory',
          name: entryData.name,
          async *entries() {
            // This would need to be implemented to read directory contents using Tauri APIs
          },
          async *keys() {},
          async *values() {},
          getDirectoryHandle: async (name: string) => {
            throw new Error('Not implemented for Tauri mock handle');
          },
          getFileHandle: async (name: string) => {
            throw new Error('Not implemented for Tauri mock handle');
          },
          removeEntry: async (name: string) => {
            throw new Error('Not implemented for Tauri mock handle');
          },
          resolve: async (possibleDescendant: FileSystemHandle) => {
            return null;
          },
          queryPermission: async () => 'granted' as PermissionState,
          requestPermission: async () => 'granted' as PermissionState,
          _tauriPath: entryData.tauriPath,
        } as any;
      }
    }
    localEntries.set(entryData.id, entryData as LocalEntry);
  }

  const dataSources = new Map<PersistentDataSourceId, AnyDataSource>(
    dataSourcesArray.map((ds) => [ds.id, ds]),
  );
  const sqlScripts = new Map<SQLScriptId, SQLScript>(
    sqlScriptsArray.map((script) => [script.id, script]),
  );
  const tabs = new Map<TabId, AnyTab>(tabsArray.map((tab) => [tab.id, tab]));

  // For now, use default content view state
  // TODO: Store content view state in SQLite
  const activeTabId = null;
  const previewTabId = null;
  const tabOrder: TabId[] = [];

  // Store the adapter in app state
  useAppStore.setState({ _persistenceAdapter: adapter });

  // Update app state (but don't set dataSources yet, we'll update it after ensuring system DB exists)
  useAppStore.setState({
    localEntries,
    sqlScripts,
    tabs,
    activeTabId,
    previewTabId,
    tabOrder,
  });

  // Always ensure the system database exists in data sources
  let systemDbAdded = false;
  if (!dataSources.has(SYSTEM_DATABASE_ID)) {
    const systemDb: LocalDB = {
      type: 'attached-db',
      id: SYSTEM_DATABASE_ID,
      dbName: SYSTEM_DATABASE_NAME,
      dbType: 'duckdb',
      fileSourceId: SYSTEM_DATABASE_FILE_SOURCE_ID,
    };
    dataSources.set(SYSTEM_DATABASE_ID, systemDb);
    systemDbAdded = true;

    // Persist the system database
    await adapter.put(DATA_SOURCE_TABLE_NAME, systemDb, systemDb.id);
  }

  // Get database metadata
  console.log('[restore] Getting database metadata...');
  const allDatabaseNames = ['pondpilot']; // Start with system database

  // Add all attached database names
  for (const ds of dataSources.values()) {
    if (ds.type === 'attached-db' && ds.dbName !== SYSTEM_DATABASE_NAME) {
      allDatabaseNames.push(ds.dbName);
    }
  }

  const databaseMetadata = await getDatabaseModel(conn, allDatabaseNames);
  console.log('[restore] Database metadata:', databaseMetadata);

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

  useAppStore.setState({ dataSources, databaseMetadata });

  // Register files and create views for data sources
  const registeredFiles = new Map<LocalEntryId, File>();

  for (const [id, dataSource] of dataSources) {
    if (dataSource.type === 'attached-db' || dataSource.type === 'remote-db') {
      continue;
    }

    const localEntry = localEntries.get(dataSource.fileSourceId);
    if (!localEntry || localEntry.kind !== 'file') {
      console.warn(`Local entry not found for data source ${id}`);
      continue;
    }

    try {
      // Register the file and create view
      const { registerFileSourceAndCreateView, registerFileHandle, createXlsxSheetView } =
        await import('@controllers/db/data-source');

      if (dataSource.type === 'xlsx-sheet') {
        // For Excel files, register file handle first
        const fileName = `${localEntry.uniqueAlias}.${localEntry.ext}`;

        // In Tauri, we don't need to register the file handle for Excel files
        // Just create the sheet view directly
        const tauriPath = (localEntry.handle as any)?._tauriPath || (localEntry as any).tauriPath;
        if (!tauriPath) {
          console.warn(
            `No Tauri path available for Excel file ${localEntry.name}, skipping sheet view creation`,
          );
          warnings.push(
            `Failed to restore Excel sheet: ${dataSource.sheetName} from ${localEntry.name} (no file path)`,
          );
          continue;
        }

        await createXlsxSheetView(conn, tauriPath, dataSource.sheetName, dataSource.viewName);
      } else if (localEntry.ext === 'duckdb' || localEntry.ext === 'sql') {
        // Skip duckdb and sql files - they are handled differently
        console.log(`Skipping ${localEntry.ext} file registration for ${dataSource.id}`);
      } else {
        // For other file types (csv, json, parquet)
        // In Tauri, check if handle is valid before trying to register
        if (!localEntry.handle) {
          console.warn(`No handle available for ${localEntry.name}, skipping registration`);
          warnings.push(`Failed to restore data source: ${localEntry.name} (no file handle)`);
          continue;
        }

        // In Tauri, pass the file path as fileName if handle has _tauriPath
        const tauriPath = (localEntry.handle as any)?._tauriPath || (localEntry as any).tauriPath;
        const fileName = tauriPath || `${localEntry.uniqueAlias}.${localEntry.ext}`;
        const regFile = await registerFileSourceAndCreateView(
          conn,
          localEntry.handle!, // We've already checked it's not null above
          localEntry.ext as supportedFlatFileDataSourceFileExt,
          fileName,
          dataSource.viewName,
        );
        if (regFile) {
          registeredFiles.set(localEntry.id, regFile);
        }
      }
    } catch (error) {
      console.error(`Failed to register file source for ${dataSource.id}:`, error);
      warnings.push(`Failed to restore data source: ${localEntry.name}`);
    }
  }

  useAppStore.setState({ registeredFiles });

  return { discardedEntries: [], warnings };
}
