import { v4 as uuidv4 } from 'uuid';
import { findUniqueName } from '@utils/helpers';
import { AnyFlatFileDataSource, AttachedDB, PersistentDataSourceId } from '@models/data-source';
import { DataSourceLocalFile } from '@models/file-system';

export function addFlatFileDataSource(
  localEntry: DataSourceLocalFile,
  reservedViews: Set<string>,
): AnyFlatFileDataSource {
  const dataSourceId = uuidv4() as PersistentDataSourceId;

  const viewName = findUniqueName(localEntry.uniqueAlias, (name: string) =>
    reservedViews.has(name),
  );

  switch (localEntry.ext) {
    case 'csv':
      return {
        id: dataSourceId,
        type: localEntry.ext,
        fileSourceId: localEntry.id,
        viewName,
      };
    case 'parquet':
      return {
        id: dataSourceId,
        type: localEntry.ext,
        fileSourceId: localEntry.id,
        viewName,
      };
    default:
      throw new Error('TODO: Supported data source file type');
  }
}

export function addAttachedDB(
  localEntry: DataSourceLocalFile,
  reservedDbs: Set<string>,
): AttachedDB {
  const dataSourceId = uuidv4() as PersistentDataSourceId;

  const dbName = findUniqueName(localEntry.uniqueAlias, (name: string) => reservedDbs.has(name));

  switch (localEntry.ext) {
    case 'duckdb':
      return {
        id: dataSourceId,
        type: 'attached-db',
        dbType: 'duckdb',
        fileSourceId: localEntry.id,
        dbName,
      };
    default:
      throw new Error('Unsupported database source file type');
  }
}
