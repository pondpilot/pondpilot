// Public file system related controller API's
// By convetion the order should follow CRUD groups!

import { deleteDataSources } from '@controllers/data-source';
import {
  registerAndAttachDatabase,
  registerFileHandle,
  registerFileSourceAndCreateView,
  createXlsxSheetView,
  reCreateView,
  reCreateXlsxSheetView,
  detachAndUnregisterDatabase,
} from '@controllers/db/data-source';
import { getLocalDBs, getDatabaseModel, getViews } from '@controllers/db/duckdb-meta';
import { isSameFile } from '@controllers/db/file-access';
import { ConnectionPool } from '@engines/types';
import { AnyDataSource, PersistentDataSourceId } from '@models/data-source';
import { DataBaseModel, CSV_MAX_LINE_SIZE_MB } from '@models/db';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { handleError } from '@utils/error-handling';
import {
  DataSourceLocalFile,
  ignoredFolders,
  LocalEntry,
  LocalEntryId,
  LocalFolder,
} from '@models/file-system';
import { SQL_SCRIPT_TABLE_NAME } from '@models/persisted-store';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { useAppStore } from '@store/app-store';
import { isTauriEnvironment } from '@utils/browser';
import { addLocalDB, addFlatFileDataSource, addXlsxSheetDataSource } from '@utils/data-source';
import { localEntryFromHandle } from '@utils/file-system';
import { findUniqueName } from '@utils/helpers';
import { makeSQLScriptId } from '@utils/sql-script';
import { getXlsxSheetNames } from '@utils/xlsx';

import {
  getFileReferenceForDuckDB,
  getFileContentSafe,
  isConservativeSafePath,
} from './file-helpers';
import { persistAddLocalEntry, persistDeleteLocalEntry } from './persist';

/**
 * ------------------------------------------------------------
 * -------------------------- Create --------------------------
 * ------------------------------------------------------------
 */

export const addLocalFileOrFolders = async (
  conn: ConnectionPool,
  handles: (FileSystemDirectoryHandle | FileSystemFileHandle)[],
): Promise<{
  skippedExistingEntries: LocalEntry[];
  skippedUnsupportedFiles: string[];
  skippedEmptyFolders: LocalFolder[];
  skippedEmptySheets: { fileName: string; sheets: string[] }[];
  skippedEmptyDatabases: string[];
  newEntries: [LocalEntryId, LocalEntry][];
  newDataSources: [PersistentDataSourceId, AnyDataSource][];
  errors: string[];
}> => {
  const {
    _iDbConn: iDbConn,
    _persistenceAdapter: persistenceAdapter,
    localEntries,
    registeredFiles,
    dataSources,
    databaseMetadata,
  } = useAppStore.getState();

  const usedEntryNames = new Set(
    Array.from(localEntries.values())
      .filter((entry) => entry.kind === 'file' && entry.fileType === 'data-source')
      .map((entry) => entry.uniqueAlias),
  );

  const errors: string[] = [];
  const newDatabaseNames: string[] = [];
  const newManagedViews: string[] = [];
  // Fetch currently attached databases, to avoid name collisions
  const reservedDbs = new Set((await getLocalDBs(conn, false)) || []);
  // Same for views
  const reservedViews = new Set((await getViews(conn, PERSISTENT_DB_NAME, 'main')) || []);

  const skippedExistingEntries: LocalEntry[] = [];
  const skippedUnsupportedFiles: string[] = [];
  const skippedEmptyFolders: LocalFolder[] = [];
  const skippedEmptySheets: { fileName: string; sheets: string[] }[] = [];
  const skippedEmptyDatabases: string[] = [];
  const newEntries: [LocalEntryId, LocalEntry][] = [];
  const newRegisteredFiles: [LocalEntryId, File][] = [];
  const newDataSources: [PersistentDataSourceId, AnyDataSource][] = [];

  /**
   * Check if a database is empty (has no user tables or views)
   */
  const isDatabaseEmpty = async (dbName: string): Promise<boolean> => {
    try {
      const result = await conn.query(
        `SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_catalog = '${dbName}' AND table_schema != 'information_schema'`,
      );
      const tableCount = result.getChild('table_count')?.get(0) ?? 0;
      // Handle both BigInt (0n) and number (0) returned by DuckDB

      return tableCount === 0n || tableCount === 0;
    } catch (error) {
      // If we can't check, assume it's not empty to avoid suppressing real errors
      console.warn(`Could not check if database ${dbName} is empty:`, error);
      return false;
    }
  };

  const addFile = async (file: DataSourceLocalFile): Promise<boolean> => {
    switch (file.ext) {
      case 'duckdb': {
        const dbSource = addLocalDB(file, reservedDbs);

        // Assume it will be added, so reserve the name
        reservedDbs.add(dbSource.dbName);

        // And save to new dbs as we'll need it later to get new metadata
        newDatabaseNames.push(dbSource.dbName);

        const fileReference = getFileReferenceForDuckDB(file);

        // Preflight: check for dangerous path patterns
        if (!isConservativeSafePath(fileReference)) {
          errors.push(
            `Cannot attach database from path: "${fileReference}". ` +
              'The path contains potentially dangerous characters or patterns.',
          );
          return false;
        }

        let regFile: File | null = null;
        try {
          regFile = await registerAndAttachDatabase(
            conn,
            file.handle,
            fileReference,
            dbSource.dbName,
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(
            `Failed to attach database "${dbSource.dbName}" from file "${file.name}": ${errorMessage}`,
          );
          handleError(error, {
            operation: 'attachSourceFile',
            userAction: `attach database from ${file.name}`,
            details: { 
              fileName: file.name,
              fileType: file.fileType,
              dbName: dbSource.dbName,
            },
          }, { showNotification: false });
          return false;
        }

        if (regFile) {
          newRegisteredFiles.push([file.id, regFile]);
        }
        newDataSources.push([dbSource.id, dbSource]);
        return true;
      }
      case 'db': {
        // SQLite support is only available in Tauri
        if (!isTauriEnvironment()) {
          errors.push(
            'SQLite database files (.db) are only supported in the desktop version. ' +
              'Please download PondPilot Desktop to work with SQLite databases.',
          );
          return false;
        }

        const dbSource = addLocalDB(file, reservedDbs);

        // Assume it will be added, so reserve the name
        reservedDbs.add(dbSource.dbName);

        // And save to new dbs as we'll need it later to get new metadata
        newDatabaseNames.push(dbSource.dbName);

        const fileReference = getFileReferenceForDuckDB(file);

        // Preflight: check for dangerous path patterns
        if (!isConservativeSafePath(fileReference)) {
          errors.push(
            `Cannot attach database from path: "${fileReference}". ` +
              'The path contains potentially dangerous characters or patterns.',
          );
          return false;
        }

        let regFile: File | null = null;
        try {
          regFile = await registerAndAttachDatabase(
            conn,
            file.handle,
            fileReference,
            dbSource.dbName,
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(
            `Failed to attach database "${dbSource.dbName}" from file "${file.name}": ${errorMessage}`,
          );
          handleError(error, {
            operation: 'attachSourceFile',
            userAction: `attach database from ${file.name}`,
            details: { 
              fileName: file.name,
              fileType: file.fileType,
              dbName: dbSource.dbName,
            },
          }, { showNotification: false });
          return false;
        }

        // Check if database is empty and skip it if it is
        const isEmpty = await isDatabaseEmpty(dbSource.dbName);
        if (isEmpty) {
          // Track skipped empty database
          skippedEmptyDatabases.push(file.name);
          // Detach and unregister the empty database
          await detachAndUnregisterDatabase(
            conn,
            dbSource.dbName,
            `${file.uniqueAlias}.${file.ext}`,
          );
          // Remove from reserved names
          reservedDbs.delete(dbSource.dbName);
          const idx = newDatabaseNames.indexOf(dbSource.dbName);
          if (idx > -1) newDatabaseNames.splice(idx, 1);
          // Don't add empty database to UI
          return false;
        }

        if (regFile) {
          newRegisteredFiles.push([file.id, regFile]);
        }
        newDataSources.push([dbSource.id, dbSource]);
        return true;
      }
      case 'xlsx': {
        // Excel file: only add if at least one sheet has data
        let sheetNames: string[] = [];

        const xlsxFile = await getFileContentSafe(file.handle);
        if (xlsxFile) {
          // Web environment: can read file directly
          sheetNames = await getXlsxSheetNames(xlsxFile);
        } else {
          // Tauri environment: use native engine to get sheet names
          try {
            if (isTauriEnvironment()) {
              const { invoke } = await import('@tauri-apps/api/core');
              const fileReference = getFileReferenceForDuckDB(file);
              sheetNames = await invoke<string[]>('get_xlsx_sheet_names', {
                file_path: fileReference,
                filePath: fileReference,
              });
            }
          } catch (error: any) {
            // Robustly extract a meaningful error message
            const extract = (e: any): string => {
              try {
                if (!e) return 'Unknown error';
                if (typeof e === 'string') return e;
                if (e.message) {
                  if (typeof e.message === 'string') {
                    // Try JSON.parse if it's a serialized object
                    try {
                      const parsed = JSON.parse(e.message);
                      if (parsed && typeof parsed === 'object') {
                        return parsed.details?.message || parsed.message || e.message;
                      }
                    } catch {
                      // not JSON, use as-is
                      return e.message;
                    }
                    return e.message;
                  }
                  // message is an object
                  try {
                    return JSON.stringify(e.message);
                  } catch {
                    /* ignore */
                  }
                }
                try {
                  return JSON.stringify(e);
                } catch {
                  return String(e);
                }
              } catch {
                return String(e);
              }
            };

            const errMsg = extract(error);
            throw new Error(
              `Failed to read sheet names from Excel file "${file.name}". ` +
                'The file may be corrupted or in an unsupported format. ' +
                `Error: ${errMsg}`,
            );
          }
        }

        if (sheetNames.length === 0) {
          errors.push(`XLSX file ${file.name} has no sheets.`);
          return false;
        }

        // Get proper file reference for DuckDB
        const fileReference = getFileReferenceForDuckDB(file);
        const succeededSheets: string[] = [];
        const skippedSheets: string[] = [];
        let regFile: File | null = null;
        for (const sheetName of sheetNames) {
          try {
            if (!regFile) {
              regFile = await registerFileHandle(
                conn,
                file.handle,
                `${file.uniqueAlias}.${file.ext}`,
              );
              if (regFile) {
                newRegisteredFiles.push([file.id, regFile]);
              }
            }
            const sheetDataSource = addXlsxSheetDataSource(file, sheetName, reservedViews);
            reservedViews.add(sheetDataSource.viewName);
            newManagedViews.push(sheetDataSource.viewName);
            await createXlsxSheetView(conn, fileReference, sheetName, sheetDataSource.viewName);
            newDataSources.push([sheetDataSource.id, sheetDataSource]);
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
        if (succeededSheets.length === 0) {
          errors.push(`XLSX file ${file.name} has no data in any sheet.`);
          return false;
        }
        if (skippedSheets.length > 0) {
          skippedEmptySheets.push({ fileName: file.name, sheets: skippedSheets });
        }
        return true;
      }
      default: {
        // Other flat file (csv/json)
        const dataSource = addFlatFileDataSource(file, reservedViews);

        // Add to reserved views
        reservedViews.add(dataSource.viewName);
        // Add to new managed views for metadata updates later
        newManagedViews.push(dataSource.viewName);

        // Then register the file source and create the view.
        try {
          const fileReference = getFileReferenceForDuckDB(file);
          const regFile = await registerFileSourceAndCreateView(
            conn,
            file.handle,
            file.ext,
            fileReference,
            dataSource.viewName,
          );

          if (regFile) {
            newRegisteredFiles.push([file.id, regFile]);
          }
          newDataSources.push([dataSource.id, dataSource]);
          return true;
        } catch (err) {
          // Remove from reserved views since it failed
          reservedViews.delete(dataSource.viewName);
          const idx = newManagedViews.indexOf(dataSource.viewName);
          if (idx > -1) {
            newManagedViews.splice(idx, 1);
          }

          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('Maximum line size exceeded')) {
            errors.push(
              `CSV file ${file.name} has lines that exceed the maximum size limit (${CSV_MAX_LINE_SIZE_MB}MB). Please split the file into smaller chunks or contact support.`,
            );
          } else if (msg.includes('Out of Memory')) {
            errors.push(
              `CSV file ${file.name} is too large to process. Try splitting it into smaller files.`,
            );
          } else if (
            msg.includes('Invalid Input Error') &&
            msg.includes('Error when sniffing file')
          ) {
            // This typically happens when CSV has very large lines that prevent proper parsing
            errors.push(
              `CSV file ${file.name} could not be parsed. This often happens with files containing very large data fields. Try splitting the file into smaller chunks or ensure the CSV format is valid.`,
            );
          } else if (msg.includes('Possible fixes:')) {
            // DuckDB verbose error - extract just the main error message
            const mainError = msg.split('\n')[0] || msg;
            errors.push(`Failed to import ${file.name}: ${mainError}`);
          } else {
            // For any other errors, truncate if too long
            const maxLength = 200;
            const errorMsg = msg.length > maxLength ? `${msg.substring(0, maxLength)}...` : msg;
            errors.push(`Failed to import ${file.name}: ${errorMsg}`);
          }
          return false;
        }
      }
    }
  };

  const addDirectory = async (folder: LocalFolder) => {
    for await (const [_, handle] of folder.handle.entries()) {
      await processHandle(handle, folder.id);
    }
  };

  const processHandle = async (
    handle: FileSystemDirectoryHandle | FileSystemFileHandle,
    parentId: LocalEntryId | null,
  ) => {
    const userAdded = parentId === null;
    const localEntry = localEntryFromHandle(
      handle,
      parentId,
      userAdded,
      (fileName: string): string =>
        handle.kind === 'file'
          ? findUniqueName(fileName, (name: string) => usedEntryNames.has(name))
          : fileName,
    );

    if (!localEntry) {
      // Unsupported file type. Nothing to add to store.
      skippedUnsupportedFiles.push(handle.name);
      return;
    }

    const isDir = localEntry.kind === 'directory';
    const isDataSourceFile = !isDir && localEntry.fileType === 'data-source';

    // Silently skip ignored folders
    if (isDir && ignoredFolders.has(localEntry.name.toUpperCase())) {
      return;
    }

    let alreadyExists = false;

    // Check if the entry already exists in the store
    // TODO: this is a "stupid" check in a sense that it is not handling
    // when a folder is being added that brings in a previously existing file.
    // The full proper reocnciliation is not implemented yet.
    for (const entry of localEntries.values()) {
      if (await isSameFile(entry, localEntry)) {
        skippedExistingEntries.push(localEntry);
        alreadyExists = true;
        break;
      }
    }

    // Entry already exists, skip adding it
    if (alreadyExists) {
      return;
    }

    if (isDir) {
      await addDirectory(localEntry);
      // Skip empty folders
      if (newEntries.some(([_, entry]) => entry.parentId === localEntry.id)) {
        newEntries.push([localEntry.id, localEntry]);
      } else {
        skippedEmptyFolders.push(localEntry);
      }
    }

    if (isDataSourceFile) {
      // Add data source file only if at least one sheet/view was registered
      const added = await addFile(localEntry);
      if (added) {
        newEntries.push([localEntry.id, localEntry]);
        usedEntryNames.add(localEntry.uniqueAlias); // Ensure uniqueAlias is reserved for subsequent files
      }
    }
  };

  for (const handle of handles) {
    await processHandle(handle, null);
  }

  // Create an object to pass to store update
  const newState: {
    localEntries: Map<LocalEntryId, LocalEntry>;
    registeredFiles: Map<LocalEntryId, File>;
    dataSources?: Map<PersistentDataSourceId, AnyDataSource>;
    databaseMetadata?: Map<string, DataBaseModel>;
  } = {
    localEntries: new Map(Array.from(localEntries).concat(newEntries)),
    registeredFiles: new Map(Array.from(registeredFiles).concat(newRegisteredFiles)),
  };

  if (newDataSources.length > 0) {
    newState.dataSources = new Map(Array.from(dataSources).concat(newDataSources));
  }

  // Read the metadata for the newly attached databases
  let newDatabaseMetadata: Map<string, DataBaseModel> | null = null;
  if (newDatabaseNames.length > 0) {
    // console.log(
    //   '[processHandles] Reading metadata for newly attached databases:',
    //   newDatabaseNames,
    // );
    try {
      newDatabaseMetadata = await getDatabaseModel(conn, newDatabaseNames);
      // console.log('[processHandles] Metadata retrieved, size:', newDatabaseMetadata.size);
      // console.log(
      //   '[processHandles] Database names in metadata:',
      //   Array.from(newDatabaseMetadata.keys()),
      // );

      if (newDatabaseMetadata.size === 0) {
        errors.push(
          'Failed to read newly attached database metadata. Neither explorer not auto-complete will not show objects for them. You may try deleting and re-attaching the database(s).',
        );
      }
    } catch (error) {
      // console.error('[processHandles] Error reading database metadata:', error);
      errors.push(
        `Error reading database metadata: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Read the metadata for the newly created views
  let newViewsMetadata: Map<string, DataBaseModel> | null = null;
  if (newManagedViews.length > 0) {
    // Get metadata for pondpilot database to include file views
    newViewsMetadata = await getDatabaseModel(conn, [PERSISTENT_DB_NAME], ['main']);
  }

  // Update the metadata state
  if (newDatabaseMetadata || newViewsMetadata) {
    // Merge the metadata, ensuring pondpilot database always has at least an empty schema
    const mergedMetadata = new Map([
      ...databaseMetadata,
      ...(newDatabaseMetadata || []),
      ...(newViewsMetadata || []),
    ]);

    // Ensure pondpilot database has metadata even if empty
    if (!mergedMetadata.has(PERSISTENT_DB_NAME)) {
      mergedMetadata.set(PERSISTENT_DB_NAME, {
        name: PERSISTENT_DB_NAME,
        schemas: [
          {
            name: 'main',
            objects: [],
          },
        ],
      });
    }

    newState.databaseMetadata = mergedMetadata;
  }

  // Update the store
  useAppStore.setState(newState, undefined, 'AppStore/addLocalFileOrFolders');

  // Persist the new local entry using the appropriate adapter
  const persistenceStore = persistenceAdapter || iDbConn;
  if (persistenceStore) {
    persistAddLocalEntry(persistenceStore, newEntries, newDataSources);
  }

  // Return the new local entry and data source
  return {
    skippedExistingEntries,
    skippedUnsupportedFiles,
    skippedEmptyFolders,
    skippedEmptySheets,
    skippedEmptyDatabases,
    newEntries,
    newDataSources,
    errors,
  };
};

export const importSQLFilesAndCreateScripts = async (handles: FileSystemFileHandle[]) => {
  const {
    _iDbConn: iDbConn,
    _persistenceAdapter: persistenceAdapter,
    sqlScripts,
  } = useAppStore.getState();

  const newScripts: [SQLScriptId, SQLScript][] = [];

  for (const handle of handles) {
    const fileName = handle.name;
    const nameWithoutExt = fileName.split('.').slice(0, -1).join('.');
    const fileContent = await handle.getFile().then((file) => file.text());

    const sqlScriptId = makeSQLScriptId();
    const sqlScript: SQLScript = {
      id: sqlScriptId,
      name: nameWithoutExt,
      content: fileContent,
    };

    newScripts.push([sqlScriptId, sqlScript]);
  }

  // Create an object to pass to store update
  const newState: {
    sqlScripts: Map<SQLScriptId, SQLScript>;
  } = {
    sqlScripts: new Map(Array.from(sqlScripts).concat(newScripts)),
  };

  // Update the store
  useAppStore.setState(newState, undefined, 'AppStore/importSQLFiles');

  // Persist the new SQL scripts using the appropriate adapter
  const persistenceStore = persistenceAdapter || iDbConn;
  if (persistenceStore) {
    for (const [id, script] of newScripts) {
      if (persistenceAdapter) {
        await persistenceAdapter.put(SQL_SCRIPT_TABLE_NAME, script, id);
      } else if (iDbConn) {
        await iDbConn.put(SQL_SCRIPT_TABLE_NAME, script, id);
      }
    }
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

export const deleteLocalFileOrFolders = (conn: ConnectionPool, ids: LocalEntryId[]) => {
  const {
    dataSources,
    localEntries,
    _iDbConn: iDbConn,
    _persistenceAdapter: persistenceAdapter,
  } = useAppStore.getState();

  const folderChildren = new Map<LocalEntryId, LocalEntry[]>();
  for (const [_, entry] of localEntries) {
    if (entry.parentId === null) {
      continue;
    }
    const children = folderChildren.get(entry.parentId) || [];
    children.push(entry);
    folderChildren.set(entry.parentId, children);
  }

  // Map file IDs to data source IDs
  const fileIdToDataSourceIds = new Map<LocalEntryId, PersistentDataSourceId[]>();
  for (const [dataSourceId, dataSource] of dataSources) {
    if (dataSource.type === 'attached-db' || dataSource.type === 'remote-db') {
      continue;
    }
    const fileId = dataSource.fileSourceId;
    const existing = fileIdToDataSourceIds.get(fileId) || [];
    existing.push(dataSourceId);
    fileIdToDataSourceIds.set(fileId, existing);
  }

  const dataSourceIdsToDelete: PersistentDataSourceId[] = [];
  const folderIdsToDelete = new Set<LocalEntryId>();

  const collectDataSourceIdsRecursively = (folder: LocalFolder) => {
    folderIdsToDelete.add(folder.id);
    const children = folderChildren.get(folder.id);
    if (children) {
      for (const child of children) {
        if (child.kind === 'directory') {
          collectDataSourceIdsRecursively(child);
        } else {
          // Do not delete file entries here, they are handled automatically in its data source delete
          // Add all associated data sources
          const dsIds = fileIdToDataSourceIds.get(child.id);
          if (dsIds && dsIds.length > 0) {
            dataSourceIdsToDelete.push(...dsIds);
          }
        }
      }
    }
  };

  for (const entryId of ids) {
    const localEntry = localEntries.get(entryId);
    if (!localEntry) {
      continue;
    }

    if (localEntry.kind === 'directory') {
      collectDataSourceIdsRecursively(localEntry);
    } else {
      // Do not delete file entries here, they are handled automatically in its data source delete
      const dsIds = fileIdToDataSourceIds.get(localEntry.id);
      if (dsIds && dsIds.length > 0) {
        dataSourceIdsToDelete.push(...dsIds);
      }
    }
  }

  // Delete folder entries from State
  const { localEntries: freshLocalEntries } = useAppStore.getState();
  const newLocalEntires = new Map(
    Array.from(freshLocalEntries).filter(([id, _]) => !folderIdsToDelete.has(id)),
  );
  useAppStore.setState(
    {
      localEntries: newLocalEntires,
    },
    undefined,
    'AppStore/deleteLocalFileOrFolders',
  );

  // This one will delete all collected data sources and related state
  if (dataSourceIdsToDelete.length > 0) {
    deleteDataSources(conn, dataSourceIdsToDelete);
  }

  // Delete folder entries from persistence store
  const persistenceStore = persistenceAdapter || iDbConn;
  if (persistenceStore) {
    persistDeleteLocalEntry(persistenceStore, folderIdsToDelete);
  }
};

type FileReadabilityStatus = 'readable' | 'notFound' | 'notReadable';

const checkFileReadability = async (
  file: File | FileSystemFileHandle,
): Promise<FileReadabilityStatus> => {
  try {
    const f = file instanceof File ? file : await file.getFile();
    // Cheapest and shortest way to check if the file is readable is to slice the first byte
    await f.slice(0, 1).arrayBuffer();
    return 'readable';
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      return 'notFound';
    }
    if (error.name === 'NotReadableError') {
      return 'notReadable';
    }
  }
  return 'notReadable';
};

export const syncFiles = async (conn: ConnectionPool) => {
  const { localEntries, registeredFiles, dataSources } = useAppStore.getState();

  const localFiles = Array.from(localEntries.values()).filter(
    (entry) => entry.kind === 'file' && entry.fileType === 'data-source',
  );
  const newRegisteredFiles = new Map<LocalEntryId, File>();
  const localFileToDelete: DataSourceLocalFile[] = [];

  for await (const source of localFiles) {
    const snapshotFile = registeredFiles.get(source.id);
    const checkSnapshotFile = snapshotFile ? await checkFileReadability(snapshotFile) : undefined;

    if (checkSnapshotFile === 'readable') continue;
    const checkCurrentFile = await checkFileReadability(source.handle);

    if (checkCurrentFile === 'readable') {
      // File content was changed
      // Try to register it again and recreate associated views
      try {
        const regFile = await registerFileHandle(
          conn,
          source.handle,
          `${source.uniqueAlias}.${source.ext}`,
        );
        if (!regFile) {
          throw new Error(`Failed to register file handle for ${source.uniqueAlias}.${source.ext}`);
        }
        newRegisteredFiles.set(source.id, regFile);

        // Find and recreate all views associated with this file
        const associatedDataSources = Array.from(dataSources.values()).filter(
          (ds) =>
            (ds.type === 'csv' ||
              ds.type === 'json' ||
              ds.type === 'parquet' ||
              ds.type === 'xlsx-sheet') &&
            ds.fileSourceId === source.id,
        );

        for (const dataSource of associatedDataSources) {
          if (dataSource.type === 'xlsx-sheet') {
            await reCreateXlsxSheetView(
              conn,
              `${source.uniqueAlias}.${source.ext}`,
              dataSource.sheetName,
              dataSource.viewName,
              dataSource.viewName,
            );
          } else if (
            dataSource.type === 'csv' ||
            dataSource.type === 'json' ||
            dataSource.type === 'parquet'
          ) {
            await reCreateView(
              conn,
              source.ext as 'csv' | 'json' | 'parquet',
              `${source.uniqueAlias}.${source.ext}`,
              dataSource.viewName,
              dataSource.viewName,
            );
          }
        }
      } catch (e) {
        // console.error(`Failed to register file handle ${source.handle.name}:`, e);
        localFileToDelete.push(source);
      }
    } else {
      // File was deleted/moved or read permission was revoked
      localFileToDelete.push(source);
    }
  }

  // Update state
  useAppStore.setState(
    {
      registeredFiles: new Map([...registeredFiles, ...newRegisteredFiles]),
    },
    undefined,
    'AppStore/syncFiles',
  );

  // Delete data sources related to deleted local file entries
  if (localFileToDelete.length > 0) {
    // Get Data Sources to delete
    const localFileIdsToDelete = new Set(localFileToDelete.map((file) => file.id));
    const { dataSources: dataSourcesForDelete } = useAppStore.getState();
    const dataSourceIdsToDelete = new Set<PersistentDataSourceId>();
    for (const [dataSourceId, dataSource] of dataSourcesForDelete) {
      if (
        dataSource.type !== 'attached-db' &&
        dataSource.type !== 'remote-db' &&
        localFileIdsToDelete.has(dataSource.fileSourceId)
      ) {
        dataSourceIdsToDelete.add(dataSourceId);
      }
    }

    // Delete data sources, this will also delete local file entries
    if (dataSourceIdsToDelete.size > 0) {
      deleteDataSources(conn, Array.from(dataSourceIdsToDelete));
    }
  }
};
