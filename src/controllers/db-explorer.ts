import { ConnectionPool } from '@engines/types';
import { LocalDB, PersistentDataSourceId } from '@models/data-source';
import { useAppStore } from '@store/app-store';
import { DUCKDB_FORBIDDEN_ATTACHED_DB_NAMES } from '@utils/duckdb/identifier';
import { withErrorHandling } from '@utils/error-handling';
import { findUniqueName } from '@utils/helpers';

import { persistPutDataSources } from './data-source/persist';
import { reAttachDatabase } from './db/data-source';
import { getLocalDBs } from './db/duckdb-meta';

export const renameDB = withErrorHandling(
  async (dbId: PersistentDataSourceId, newName: string, conn: ConnectionPool): Promise<void> => {
    const { _iDbConn: iDbConn, dataSources, localEntries } = useAppStore.getState();

    // Check if the data source exists
    const dataSource = dataSources.get(dbId);
    if (!dataSource || dataSource.type !== 'attached-db') {
      throw new Error(
        `Cannot rename database: Database with ID "${dbId}" was not found or is not a local database. ` +
          'It may have been removed or is a different type of data source.',
      );
    }

    // Get local entry for the database
    const localEntry = localEntries.get(dataSource.fileSourceId);
    if (!localEntry || localEntry.kind !== 'file') {
      throw new Error(
        `Cannot rename database: The file associated with database "${dataSource.dbName}" could not be found. ` +
          'The file may have been moved, deleted, or is no longer accessible.',
      );
    }

    const oldDbName = dataSource.dbName;

    // Fetch currently attached databases, to avoid name collisions
    const reservedDbs = new Set((await getLocalDBs(conn, false)) || []);

    // Make sure the name is unique
    const newDbName = findUniqueName(
      newName,
      (name: string) => reservedDbs.has(name) || DUCKDB_FORBIDDEN_ATTACHED_DB_NAMES.includes(name),
    );

    // Detach the old name and attach with the new name
    await reAttachDatabase(
      conn,
      `${localEntry.uniqueAlias}.${localEntry.ext}`,
      oldDbName,
      newDbName,
    );

    // Create updated data source
    const updatedDB: LocalDB = {
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
    const { databaseMetadata } = useAppStore.getState();
    const metadata = databaseMetadata.get(oldDbName);
    if (metadata) {
      const newDatabaseMetadata = new Map(databaseMetadata);
      // Replace the old name with the new name
      metadata.name = newDbName;
      newDatabaseMetadata.set(newDbName, metadata);
      newDatabaseMetadata.delete(oldDbName);
      useAppStore.setState(
        {
          databaseMetadata: newDatabaseMetadata,
        },
        undefined,
        'AppStore/renameDB',
      );
    }
  },
  {
    operation: 'renameDB',
    userAction: 'rename database',
  },
  {
    notificationTitle: 'Failed to rename database',
  },
);
