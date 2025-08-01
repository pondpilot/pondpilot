import {
  LocalDB,
  RemoteDB,
  SYSTEM_DATABASE_ID,
  AnyDataSource,
  SYSTEM_DATABASE_NAME,
} from '@models/data-source';
import { isTauriEnvironment } from '@utils/browser';
import { useMemo } from 'react';

export const useDatabaseSeparation = (allDataSources: Map<string, AnyDataSource>) => {
  return useMemo(() => {
    console.log('[useDatabaseSeparation] All data sources:', allDataSources);
    console.log('[useDatabaseSeparation] Is Tauri environment:', isTauriEnvironment());

    let systemDb: LocalDB | undefined;
    const localDbs: LocalDB[] = [];
    const remoteDbs: RemoteDB[] = [];

    allDataSources.forEach((dataSource) => {
      if (dataSource.type === 'attached-db') {
        // The system database is always 'pondpilot'
        const isSystemDb =
          dataSource.id === SYSTEM_DATABASE_ID || dataSource.dbName === SYSTEM_DATABASE_NAME;

        if (isSystemDb) {
          systemDb = dataSource;
        } else {
          localDbs.push(dataSource);
        }
      } else if (dataSource.type === 'remote-db') {
        remoteDbs.push(dataSource);
      }
    });

    // Sort databases
    localDbs.sort((a, b) => a.dbName.localeCompare(b.dbName));
    remoteDbs.sort((a, b) => a.dbName.localeCompare(b.dbName));

    return { systemDatabase: systemDb, localDatabases: localDbs, remoteDatabases: remoteDbs };
  }, [allDataSources]);
};
