// Public file system related controller API's
// By convetion the order should follow CRUD groups!

import { deleteDataSources } from '@controllers/data-source';
import {
  registerAndAttachDatabase,
  registerFileHandle,
  registerFileSourceAndCreateView,
  createXlsxSheetView,
} from '@controllers/db/data-source';
import { getAttachedDBs, getDatabaseModel, getViews } from '@controllers/db/duckdb-meta';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { AnyDataSource, PersistentDataSourceId } from '@models/data-source';
import { DataBaseModel } from '@models/db';
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
import { addAttachedDB, addFlatFileDataSource, addXlsxSheetDataSource } from '@utils/data-source';
import { localEntryFromHandle } from '@utils/file-system';
import { findUniqueName } from '@utils/helpers';
import { makeSQLScriptId } from '@utils/sql-script';
import { getXlsxSheetNames } from '@utils/xlsx';

import { persistAddLocalEntry, persistDeleteLocalEntry } from './persist';

/**
 * ------------------------------------------------------------
 * -------------------------- Create --------------------------
 * ------------------------------------------------------------
 */

export const addLocalFileOrFolders = async (
  conn: AsyncDuckDBConnectionPool,
  handles: (FileSystemDirectoryHandle | FileSystemFileHandle)[],
): Promise<{
  skippedExistingEntries: LocalEntry[];
  skippedUnsupportedFiles: string[];
  skippedEmptyFolders: LocalFolder[];
  newEntries: [LocalEntryId, LocalEntry][];
  newDataSources: [PersistentDataSourceId, AnyDataSource][];
  errors: string[];
}> => {
  const {
    _iDbConn: iDbConn,
    localEntries,
    registeredFiles,
    dataSources,
    dataBaseMetadata,
  } = useAppStore.getState();

  const usedEntryNames = new Set(localEntries.values().map((entry) => entry.uniqueAlias));

  const errors: string[] = [];
  const newDatabaseNames: string[] = [];
  const newManagedViews: string[] = [];
  // Fetch currently attached databases, to avoid name collisions
  const reservedDbs = new Set((await getAttachedDBs(conn, false)) || ['memory']);
  // Same for views
  const reservedViews = new Set((await getViews(conn, 'memory', 'main')) || []);

  const skippedExistingEntries: LocalEntry[] = [];
  const skippedUnsupportedFiles: string[] = [];
  const skippedEmptyFolders: LocalFolder[] = [];
  const newEntries: [LocalEntryId, LocalEntry][] = [];
  const newRegisteredFiles: [LocalEntryId, File][] = [];
  const newDataSources: [PersistentDataSourceId, AnyDataSource][] = [];

  const addFile = async (file: DataSourceLocalFile) => {
    switch (file.ext) {
      case 'duckdb': {
        const dbSource = addAttachedDB(file, reservedDbs);

        // Assume it will be added, so reserve the name
        reservedDbs.add(dbSource.dbName);

        // And save to new dbs as we'll need it later to get new metadata
        newDatabaseNames.push(dbSource.dbName);

        // TODO: currently we assume this works, add proper error handling
        const regFile = await registerAndAttachDatabase(
          conn,
          file.handle,
          `${file.uniqueAlias}.${file.ext}`,
          dbSource.dbName,
        );

        newRegisteredFiles.push([file.id, regFile]);
        newDataSources.push([dbSource.id, dbSource]);

        break;
      }
      case 'xlsx': {
        // For XLSX files, we need to get all sheet names and create a view for each sheet
        const xlsxFile = await file.handle.getFile();
        const sheetNames = await getXlsxSheetNames(xlsxFile);

        if (sheetNames.length === 0) {
          errors.push(`XLSX file ${file.name} has no sheets.`);
          return;
        }

        // Register the file once
        const fileName = `${file.uniqueAlias}.${file.ext}`;
        const regFile = await registerFileHandle(conn, file.handle, fileName);
        newRegisteredFiles.push([file.id, regFile]);

        // For each sheet, create a data source and view
        for (const sheetName of sheetNames) {
          const sheetDataSource = addXlsxSheetDataSource(file, sheetName, reservedViews);

          reservedViews.add(sheetDataSource.viewName);
          newManagedViews.push(sheetDataSource.viewName);

          await createXlsxSheetView(conn, fileName, sheetName, sheetDataSource.viewName);

          newDataSources.push([sheetDataSource.id, sheetDataSource]);
        }

        break;
      }
      default: {
        // First create a data view object
        const dataSource = addFlatFileDataSource(file, reservedViews);

        // Add to reserved views
        reservedViews.add(dataSource.viewName);
        // Add to new managed views for metadata updates later
        newManagedViews.push(dataSource.viewName);

        // Then register the file source and create the view.
        // TODO: this may potentially fail - we should handle this case
        const regFile = await registerFileSourceAndCreateView(
          conn,
          file.handle,
          file.ext,
          `${file.uniqueAlias}.${file.ext}`,
          dataSource.viewName,
        );

        newRegisteredFiles.push([file.id, regFile]);
        newDataSources.push([dataSource.id, dataSource]);
        break;
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
        findUniqueName(fileName, (name: string) => usedEntryNames.has(name)),
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
      if (await entry.handle.isSameEntry(localEntry.handle)) {
        skippedExistingEntries.push(localEntry);
        alreadyExists = true;
        break;
      }
    }

    // Entry already exists, skip adding it
    if (alreadyExists) {
      return;
    }

    // New entry, remember it's unique alias and add it to the store
    usedEntryNames.add(localEntry.uniqueAlias);

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
      await addFile(localEntry);
      newEntries.push([localEntry.id, localEntry]);
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
    dataBaseMetadata?: Map<string, DataBaseModel>;
  } = {
    localEntries: new Map(Array.from(localEntries).concat(newEntries)),
    registeredFiles: new Map(Array.from(registeredFiles).concat(newRegisteredFiles)),
  };

  if (newDataSources.length > 0) {
    newState.dataSources = new Map(Array.from(dataSources).concat(newDataSources));
  }

  // Read the metadata for the newly attached databases
  let newDataBaseMetadata: Map<string, DataBaseModel> | null = null;
  if (newDatabaseNames.length > 0) {
    newDataBaseMetadata = await getDatabaseModel(conn, newDatabaseNames);
    if (newDataBaseMetadata.size === 0) {
      errors.push(
        'Failed to read newly attached database metadata. Neither explorer not auto-complete will not show objects for them. You may try deleting and re-attaching the database(s).',
      );
    }
  }

  // Read the metadata for the newly created views
  let newViewsMetadata: Map<string, DataBaseModel> | null = null;
  if (newManagedViews.length > 0) {
    newViewsMetadata = await getDatabaseModel(conn, ['memory'], ['main']);
  }

  // Update the metadata state
  if (newDataBaseMetadata || newViewsMetadata) {
    newState.dataBaseMetadata = new Map([
      ...dataBaseMetadata,
      ...(newDataBaseMetadata || []),
      ...(newViewsMetadata || []),
    ]);
  }

  // Update the store
  useAppStore.setState(newState, undefined, 'AppStore/addLocalFileOrFolders');

  // If we have an IndexedDB connection, persist the new local entry
  if (iDbConn) {
    persistAddLocalEntry(
      iDbConn,
      newEntries.filter(([_, entry]) => entry.userAdded), // Add only user added entries
      newDataSources,
    );
  }

  // Return the new local entry and data source
  return {
    skippedExistingEntries,
    skippedUnsupportedFiles,
    skippedEmptyFolders,
    newEntries,
    newDataSources,
    errors,
  };
};

export const importSQLFilesAndCreateScripts = async (handles: FileSystemFileHandle[]) => {
  const { _iDbConn: iDbConn, sqlScripts } = useAppStore.getState();

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

  // If we have an IndexedDB connection, persist the new SQL scripts
  if (iDbConn) {
    for (const [id, script] of newScripts) {
      iDbConn.put(SQL_SCRIPT_TABLE_NAME, script, id);
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

export const deleteLocalFileOrFolders = (conn: AsyncDuckDBConnectionPool, ids: LocalEntryId[]) => {
  const { dataSources, localEntries, _iDbConn: iDbConn } = useAppStore.getState();

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

  // Delete folder entries from IDB
  if (iDbConn) {
    persistDeleteLocalEntry(iDbConn, folderIdsToDelete);
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

export const syncFiles = async (conn: AsyncDuckDBConnectionPool) => {
  const { localEntries, registeredFiles } = useAppStore.getState();

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
      // Try to register it again
      try {
        const regFile = await registerFileHandle(
          conn,
          source.handle,
          `${source.uniqueAlias}.${source.ext}`,
        );
        newRegisteredFiles.set(source.id, regFile);
      } catch (e) {
        console.error(`Failed to register file handle ${source.handle.name}:`, e);
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
    const { dataSources } = useAppStore.getState();
    const dataSourceIdsToDelete = new Set<PersistentDataSourceId>();
    for (const [dataSourceId, dataSource] of dataSources) {
      if (localFileIdsToDelete.has(dataSource.fileSourceId)) {
        dataSourceIdsToDelete.add(dataSourceId);
      }
    }

    // Delete data sources
    if (dataSourceIdsToDelete.size > 0) {
      deleteDataSources(conn, Array.from(dataSourceIdsToDelete));
    }
  }
};
