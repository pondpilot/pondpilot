import {
  AnyDataSource,
  AnyFlatFileDataSource,
  LocalDB,
  PersistentDataSourceId,
  ReadStatView,
  RemoteDB,
} from '@models/data-source';
import { DataSourceLocalFile, READSTAT_VIEW_TYPES, ReadStatViewType } from '@models/file-system';
import { findUniqueName } from '@utils/helpers';

import { DUCKDB_FORBIDDEN_ATTACHED_DB_NAMES } from './duckdb/identifier';
import { makeIdFactory } from './new-id';

export const makePersistentDataSourceId = makeIdFactory<PersistentDataSourceId>();

export function ensureFlatFileDataSource(
  dataSourceOrId: AnyFlatFileDataSource | PersistentDataSourceId,
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
): AnyFlatFileDataSource {
  let obj: AnyDataSource;

  if (typeof dataSourceOrId === 'string') {
    const fromState = dataSources.get(dataSourceOrId);

    if (!fromState) {
      throw new Error(`Data source with id ${dataSourceOrId} not found`);
    }

    obj = fromState;
  } else {
    obj = dataSourceOrId;
  }

  if (obj.type === 'attached-db' || obj.type === 'remote-db') {
    throw new Error(`Data source with id ${obj.id} is not a flat file data source`);
  }

  return obj;
}

export function ensureLocalDBDataSource(
  dataSourceOrId: LocalDB | PersistentDataSourceId,
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
): LocalDB {
  let obj: AnyDataSource;

  if (typeof dataSourceOrId === 'string') {
    const fromState = dataSources.get(dataSourceOrId);

    if (!fromState) {
      throw new Error(`Data source with id ${dataSourceOrId} not found`);
    }

    obj = fromState;
  } else {
    obj = dataSourceOrId;
  }

  if (obj.type !== 'attached-db') {
    throw new Error(`Data source with id ${obj.id} is not a local DB data source`);
  }

  return obj;
}

export function ensureDatabaseDataSource(
  dataSourceOrId: LocalDB | RemoteDB | PersistentDataSourceId,
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
): LocalDB | RemoteDB {
  let obj: AnyDataSource;

  if (typeof dataSourceOrId === 'string') {
    const fromState = dataSources.get(dataSourceOrId);

    if (!fromState) {
      throw new Error(`Data source with id ${dataSourceOrId} not found`);
    }

    obj = fromState;
  } else {
    obj = dataSourceOrId;
  }

  if (obj.type !== 'attached-db' && obj.type !== 'remote-db') {
    throw new Error(`Data source with id ${obj.id} is not a database data source`);
  }

  return obj as LocalDB | RemoteDB;
}

export function addFlatFileDataSource(
  localEntry: DataSourceLocalFile,
  reservedViews: Set<string>,
): AnyFlatFileDataSource {
  const dataSourceId = makePersistentDataSourceId();

  const viewName = findUniqueName(localEntry.uniqueAlias, (name: string) =>
    reservedViews.has(name),
  );

  switch (localEntry.ext) {
    case 'csv':
    case 'json':
    case 'parquet':
    case 'sas7bdat':
    case 'xpt':
    case 'sav':
    case 'zsav':
    case 'por':
    case 'dta':
      return {
        id: dataSourceId,
        type: localEntry.ext,
        fileSourceId: localEntry.id,
        viewName,
      };
    default:
      throw new Error('Unexpcted unsupported data source file type');
  }
}

export function addXlsxSheetDataSource(
  localEntry: DataSourceLocalFile,
  sheetName: string,
  reservedViews: Set<string>,
): AnyFlatFileDataSource {
  if (localEntry.ext !== 'xlsx') {
    throw new Error('Only XLSX files can be used to create sheet data sources');
  }

  const dataSourceId = makePersistentDataSourceId();

  // Create a view name based on both file and sheet name
  const baseViewName = `${localEntry.uniqueAlias}_${sheetName}`;
  const viewName = findUniqueName(baseViewName, (name: string) => reservedViews.has(name));

  return {
    id: dataSourceId,
    type: 'xlsx-sheet',
    fileSourceId: localEntry.id,
    viewName,
    sheetName,
  };
}

export function addLocalDB(localEntry: DataSourceLocalFile, reservedDbs: Set<string>): LocalDB {
  const dataSourceId = makePersistentDataSourceId();

  const dbName = findUniqueName(
    localEntry.uniqueAlias,
    (name: string) => reservedDbs.has(name) || DUCKDB_FORBIDDEN_ATTACHED_DB_NAMES.includes(name),
  );

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
      throw new Error('Unexpcted unsupported database source file type');
  }
}

const READSTAT_VIEW_TYPES_SET: ReadonlySet<ReadStatViewType> = new Set(READSTAT_VIEW_TYPES);

export function isReadStatViewType(type: string): type is ReadStatViewType {
  return READSTAT_VIEW_TYPES_SET.has(type as ReadStatViewType);
}

export function isReadStatDataSource(dataSource: AnyDataSource): dataSource is ReadStatView {
  return READSTAT_VIEW_TYPES_SET.has(dataSource.type as ReadStatViewType);
}

export function isFlatFileDataSource(
  dataSource: AnyDataSource,
): dataSource is AnyFlatFileDataSource {
  return (
    dataSource.type === 'csv' ||
    dataSource.type === 'json' ||
    dataSource.type === 'parquet' ||
    dataSource.type === 'xlsx-sheet' ||
    isReadStatDataSource(dataSource)
  );
}

export function isRemoteDatabase(dataSource: AnyDataSource): dataSource is RemoteDB {
  return dataSource.type === 'remote-db';
}

export function isLocalDatabase(dataSource: AnyDataSource): dataSource is LocalDB {
  return dataSource.type === 'attached-db';
}

export function getFlatFileDataSourceFromMap(
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
): AnyFlatFileDataSource[] {
  return Array.from(dataSources.values()).filter(isFlatFileDataSource);
}
