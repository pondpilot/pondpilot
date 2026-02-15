import {
  IcebergCatalog,
  LocalDB,
  MotherDuckConnection,
  RemoteDB,
  SYSTEM_DATABASE_ID,
  AnyDataSource,
} from '@models/data-source';
import { useMemo } from 'react';

export const useDatabaseSeparation = (allDataSources: Map<string, AnyDataSource>) => {
  return useMemo(() => {
    let systemDb: LocalDB | undefined;
    const localDbs: LocalDB[] = [];
    const remoteDbs: RemoteDB[] = [];
    const icebergCatalogs: IcebergCatalog[] = [];
    const motherduckConnections: MotherDuckConnection[] = [];

    allDataSources.forEach((dataSource) => {
      if (dataSource.type === 'attached-db') {
        if (dataSource.id === SYSTEM_DATABASE_ID) {
          systemDb = dataSource;
        } else {
          localDbs.push(dataSource);
        }
      } else if (dataSource.type === 'remote-db') {
        remoteDbs.push(dataSource);
      } else if (dataSource.type === 'iceberg-catalog') {
        icebergCatalogs.push(dataSource);
      } else if (dataSource.type === 'motherduck') {
        motherduckConnections.push(dataSource);
      }
    });

    // Sort databases
    localDbs.sort((a, b) => a.dbName.localeCompare(b.dbName));
    remoteDbs.sort((a, b) => a.dbName.localeCompare(b.dbName));
    icebergCatalogs.sort((a, b) => a.catalogAlias.localeCompare(b.catalogAlias));
    motherduckConnections.sort((a, b) => a.attachedAt - b.attachedAt);

    return {
      systemDatabase: systemDb,
      localDatabases: localDbs,
      remoteDatabases: remoteDbs,
      icebergCatalogs,
      motherduckConnections,
    };
  }, [allDataSources]);
};
