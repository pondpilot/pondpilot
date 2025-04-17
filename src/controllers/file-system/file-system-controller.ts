// Public file system related controller API's
// By convetion the order should follow CRUD groups!

import { findUniqueName } from '@utils/helpers';

import { SQLScript, SQLScriptId } from '@models/sql-script';
import { AnyDataSource, PersistentDataSourceId } from '@models/data-source';
import {
  DataSourceLocalFile,
  ignoredFolders,
  LocalEntry,
  LocalEntryId,
  LocalFolder,
} from '@models/file-system';
import { localEntryFromHandle } from '@utils/file-system';

import {
  registerAndAttachDatabase,
  registerFileSourceAndCreateView,
} from '@controllers/db/data-source';
import { addAttachedDB, addFlatFileDataSource } from '@utils/data-source';
import {
  getAttachedDBs,
  getDatabaseModel,
  getObjectModels,
  getViews,
} from '@controllers/db/duckdb-meta';
import { DataBaseModel } from '@models/db';
import { makeSQLScriptId } from '@utils/sql-script';
import { SQL_SCRIPT_TABLE_NAME } from '@models/persisted-store';
import { useAppStore } from '@store/app-store';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { persistAddLocalEntry } from './persist';

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
  const { _iDbConn: iDbConn, localEntries, dataSources, dataBaseMetadata } = useAppStore.getState();

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
        await registerAndAttachDatabase(
          conn,
          file.handle,
          `${file.uniqueAlias}.${file.ext}`,
          dbSource.dbName,
        );

        newDataSources.push([dbSource.id, dbSource]);

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
        await registerFileSourceAndCreateView(
          conn,
          file.handle,
          `${file.uniqueAlias}.${file.ext}`,
          dataSource.viewName,
        );

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
    dataSources?: Map<PersistentDataSourceId, AnyDataSource>;
    dataBaseMetadata?: Map<string, DataBaseModel>;
  } = {
    localEntries: new Map(Array.from(localEntries).concat(newEntries)),
  };

  if (newDataSources.length > 0) {
    newState.dataSources = new Map(Array.from(dataSources).concat(newDataSources));
  }

  // Now read the metadata for the newly attached databases, views and
  // add it to state as well
  const newDataBaseMetadata = await getDatabaseModel(conn, newDatabaseNames);
  const newViewsMetadata = await getObjectModels(conn, 'memory', 'main', newManagedViews);

  if (newDataBaseMetadata || newViewsMetadata.length > 0) {
    const mergedDataBaseMetadata = new Map(dataBaseMetadata);

    newDataBaseMetadata?.forEach((dbModel, dbName) => mergedDataBaseMetadata.set(dbName, dbModel));

    const memoryDBModel = mergedDataBaseMetadata.get('memory') || { name: 'memory', schemas: [] };
    const mainSchemaMeta = memoryDBModel.schemas.find((schema) => schema.name === 'main');

    if (mainSchemaMeta) {
      mainSchemaMeta.objects.concat(newViewsMetadata);
    } else {
      memoryDBModel.schemas.push({
        name: 'main',
        objects: newViewsMetadata,
      });
    }

    mergedDataBaseMetadata.set('memory', memoryDBModel);

    newState.dataBaseMetadata = mergedDataBaseMetadata;
  } else {
    errors.push(
      'Failed to read newly attached database metadata. Neither explorer not auto-complete will not show objects for them. You may try deleting and re-attaching the database(s).',
    );
  }

  // Update the store
  useAppStore.setState(newState, undefined, 'AppStore/addLocalFileOrFolders');

  // If we have an IndexedDB connection, persist the new local entry
  if (iDbConn) {
    persistAddLocalEntry(iDbConn, newEntries, newDataSources);
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
  throw new Error('TODO: implement delete for folders');
};
