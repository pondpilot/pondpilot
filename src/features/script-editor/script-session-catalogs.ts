import { AnyDataSource, PersistentDataSourceId } from '@models/data-source';
import { DataBaseModel } from '@models/db';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import {
  getDatabaseIdentifier,
  isDatabaseDataSource,
  parseMotherDuckDbKey,
  parseQuackRidgeDbKey,
} from '@utils/data-source';

export const getScriptSessionCatalogs = (
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
  databaseMetadata: Map<string, DataBaseModel>,
): string[] => {
  const catalogs = new Set<string>([PERSISTENT_DB_NAME, 'memory']);
  for (const [metadataKey, metadata] of databaseMetadata) {
    const quackRidgeDatabase = parseQuackRidgeDbKey(metadataKey);
    if (quackRidgeDatabase) {
      // Proxy catalogs are created only for healthy sources. Do not offer a
      // session target that DuckDB never attached.
      if (metadata.sourceHealth === 'ready') catalogs.add(quackRidgeDatabase.dbName);
      continue;
    }
    catalogs.add(parseMotherDuckDbKey(metadataKey) ?? metadataKey);
  }
  for (const dataSource of dataSources.values()) {
    if (!isDatabaseDataSource(dataSource)) continue;
    // MotherDuck and QuackRidge are connection roots. Their attached browser
    // catalogs are added from the per-database metadata above.
    if (dataSource.type === 'motherduck' || dataSource.type === 'quackridge') continue;
    catalogs.add(getDatabaseIdentifier(dataSource));
  }
  return Array.from(catalogs).sort((a, b) => a.localeCompare(b));
};
