import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { PersistentDataSourceId, XlsxSheetView } from '@models/data-source';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { LocalEntryId } from '@models/file-system';
import { useAppStore } from '@store/app-store';
import { findUniqueName } from '@utils/helpers';

import { persistPutDataSources } from './data-source/persist';
import {
  dropFile,
  reCreateView,
  reCreateXlsxSheetView,
  registerFileHandle,
} from './db/data-source';
import { getDatabaseModel, getViews } from './db/duckdb-meta';
import { persistAddLocalEntry } from './file-system/persist';

export const renameFile = async (
  fileDataSourceId: PersistentDataSourceId,
  newName: string,
  conn: AsyncDuckDBConnectionPool,
): Promise<void> => {
  const { _iDbConn: iDbConn, dataSources, localEntries } = useAppStore.getState();

  // Check if the data source exists
  const dataSource = dataSources.get(fileDataSourceId);
  if (
    !dataSource ||
    dataSource.type === 'attached-db' ||
    dataSource.type === 'remote-db' ||
    dataSource.type === 'iceberg-catalog' ||
    dataSource.type === 'motherduck'
  ) {
    throw new Error(`File source ${fileDataSourceId} not found`);
  }

  // Get local entry for the file
  const localEntry = localEntries.get(dataSource.fileSourceId);
  if (
    !localEntry ||
    localEntry.kind !== 'file' ||
    localEntry.ext === 'duckdb' ||
    localEntry.ext === 'sql'
  ) {
    throw new Error(
      `Local entry ${dataSource.fileSourceId} associated with the file source ${fileDataSourceId} not found`,
    );
  }

  const oldViewName = dataSource.viewName;

  // Fetch views, to avoid name collisions
  const reservedViews = new Set((await getViews(conn, PERSISTENT_DB_NAME, 'main')) || []);

  // Make sure the name is unique
  const newViewName = findUniqueName(newName, (name: string) => reservedViews.has(name));

  // Drop the old view and create a new one
  await reCreateView(
    conn,
    localEntry.ext,
    `${localEntry.uniqueAlias}.${localEntry.ext}`,
    oldViewName,
    newViewName,
  );

  // Create updated data source
  const updatedDataSource = {
    ...dataSource,
    viewName: newViewName,
  };

  // Update the store
  const newDataSources = new Map(dataSources);
  newDataSources.set(updatedDataSource.id, updatedDataSource);

  // Update the store with changes
  useAppStore.setState(
    {
      dataSources: newDataSources,
    },
    undefined,
    'AppStore/renameFile',
  );

  if (iDbConn) {
    persistPutDataSources(iDbConn, [updatedDataSource]);
  }

  // Update views metadata
  const newViewsMetadata = await getDatabaseModel(conn, [PERSISTENT_DB_NAME], ['main']);
  const newDatabaseMetadata = new Map([
    ...useAppStore.getState().databaseMetadata,
    ...newViewsMetadata,
  ]);
  useAppStore.setState(
    {
      databaseMetadata: newDatabaseMetadata,
    },
    undefined,
    'AppStore/renameFile',
  );
};

export const renameXlsxFile = async (
  localEntryId: LocalEntryId,
  newName: string,
  conn: AsyncDuckDBConnectionPool,
): Promise<void> => {
  const { _iDbConn: iDbConn, dataSources, localEntries } = useAppStore.getState();

  // Fetch views, to avoid name collisions
  const reservedViews = new Set((await getViews(conn, PERSISTENT_DB_NAME, 'main')) || []);

  const updatedDataSources: XlsxSheetView[] = [];

  // Check if the local entry exists
  const localEntry = localEntries.get(localEntryId);
  if (!localEntry || localEntry.kind !== 'file' || localEntry.ext !== 'xlsx') {
    throw new Error(`Local entry ${localEntryId} not found`);
  }

  // Update the local entry name
  const usedAliases = new Set(
    Array.from(localEntries.values())
      .filter((entry) => entry.kind === 'file' && entry.id !== localEntryId)
      .map((entry) => entry.uniqueAlias),
  );
  const newUniqueAlias = findUniqueName(newName, (name: string) => usedAliases.has(name));
  const updatedLocalEntry = {
    ...localEntry,
    uniqueAlias: newUniqueAlias,
  };

  // Drop old file
  await dropFile(conn, `${localEntry.uniqueAlias}.${localEntry.ext}`);
  // Register updated file
  const newRegFile = await registerFileHandle(
    conn,
    updatedLocalEntry.handle,
    `${updatedLocalEntry.uniqueAlias}.${updatedLocalEntry.ext}`,
  );

  // Get all data sources that are associated with this file
  const curDataSources = [...dataSources.values()].filter(
    (ds) =>
      ds.type !== 'attached-db' &&
      ds.type !== 'remote-db' &&
      ds.type !== 'iceberg-catalog' &&
      ds.type !== 'motherduck' &&
      ds.fileSourceId === localEntryId,
  );

  for (const dataSource of curDataSources) {
    if (dataSource.type !== 'xlsx-sheet') {
      continue;
    }

    const oldViewName = dataSource.viewName;

    // Make sure the name is unique
    const xlsxSheetBaseViewName = `${newName}_${dataSource.sheetName}`;
    const newViewName = findUniqueName(xlsxSheetBaseViewName, (name: string) =>
      reservedViews.has(name),
    );
    reservedViews.add(newViewName);

    // Drop the old view and create a new one
    await reCreateXlsxSheetView(
      conn,
      `${updatedLocalEntry.uniqueAlias}.${updatedLocalEntry.ext}`,
      dataSource.sheetName,
      oldViewName,
      newViewName,
    );

    // Create updated data source
    updatedDataSources.push({
      ...dataSource,
      viewName: newViewName,
    });
  }

  // Update the store
  const newDataSources = new Map(dataSources);
  for (const ds of updatedDataSources) {
    newDataSources.set(ds.id, ds);
  }

  const newLocalEntries = new Map(localEntries);
  newLocalEntries.set(updatedLocalEntry.id, updatedLocalEntry);

  const newRegisteredFiles = new Map(
    Array.from(useAppStore.getState().registeredFiles).concat([[updatedLocalEntry.id, newRegFile]]),
  );

  // Update the store with changes
  useAppStore.setState(
    {
      dataSources: newDataSources,
      localEntries: newLocalEntries,
      registeredFiles: newRegisteredFiles,
    },
    undefined,
    'AppStore/renameXlsxFile',
  );

  if (iDbConn) {
    persistAddLocalEntry(
      iDbConn,
      [[updatedLocalEntry.id, updatedLocalEntry]],
      updatedDataSources.map((ds) => [ds.id, ds]),
    );
  }

  // Update views metadata
  const newViewsMetadata = await getDatabaseModel(conn, [PERSISTENT_DB_NAME], ['main']);
  const newDatabaseMetadata = new Map([
    ...useAppStore.getState().databaseMetadata,
    ...newViewsMetadata,
  ]);
  useAppStore.setState(
    {
      databaseMetadata: newDatabaseMetadata,
    },
    undefined,
    'AppStore/renameXlsxFile',
  );
};
