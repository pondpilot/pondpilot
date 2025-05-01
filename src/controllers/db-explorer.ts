import { AttachedDB, PersistentDataSourceId } from '@models/data-source';
import { useAppStore } from '@store/app-store';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { findUniqueName } from '@utils/helpers';
import { DUCKDB_FORBIDDEN_ATTACHED_DB_NAMES } from '@utils/duckdb/identifier';
import { getAttachedDBs } from './db/duckdb-meta';
import { reAttachDatabase } from './db/data-source';
import { persistPutDataSources } from './data-source/persist';

export const renameDB = async (
  dbId: PersistentDataSourceId,
  newName: string,
  conn: AsyncDuckDBConnectionPool,
): Promise<void> => {
  const { _iDbConn: iDbConn, dataSources, localEntries } = useAppStore.getState();

  // Check if the data source exists
  const dataSource = dataSources.get(dbId);
  if (!dataSource || dataSource.type !== 'attached-db') {
    throw new Error(`Attached DB with id ${dbId} not found`);
  }

  // Get local entry for the database
  const localEntry = localEntries.get(dataSource.fileSourceId);
  if (!localEntry || localEntry.kind !== 'file') {
    throw new Error(
      `Local entry ${dataSource.fileSourceId} associated with the attached DB ${dbId} not found`,
    );
  }

  const oldDbName = dataSource.dbName;

  // Fetch currently attached databases, to avoid name collisions
  const reservedDbs = new Set((await getAttachedDBs(conn, false)) || ['memory']);

  // Make sure the name is unique
  const newDbName = findUniqueName(
    newName,
    (name: string) => reservedDbs.has(name) || DUCKDB_FORBIDDEN_ATTACHED_DB_NAMES.includes(name),
  );

  // Detach the old name and attach with the new name
  await reAttachDatabase(conn, `${localEntry.uniqueAlias}.${localEntry.ext}`, oldDbName, newDbName);

  // Create updated data source
  const updatedDB: AttachedDB = {
    ...dataSource,
    dbName: newDbName,
  };

  // Update the store
  const newDataSources = new Map(dataSources);
  newDataSources.set(dbId, updatedDB);

  // Update the store with changes
  useAppStore.setState(
    {
      dataSources: newDataSources,
    },
    undefined,
    'AppStore/renameDB',
  );

  if (iDbConn) {
    persistPutDataSources(iDbConn, [updatedDB]);
  }

  // Update metadata
  const { dataBaseMetadata } = useAppStore.getState();
  const metadata = dataBaseMetadata.get(oldDbName);
  if (metadata) {
    const newDataBaseMetadata = new Map(dataBaseMetadata);
    // Replace the old name with the new name
    metadata.name = newDbName;
    newDataBaseMetadata.set(newDbName, metadata);
    newDataBaseMetadata.delete(oldDbName);
    useAppStore.setState(
      {
        dataBaseMetadata: newDataBaseMetadata,
      },
      undefined,
      'AppStore/renameDB',
    );
  }
};
