import {
  AnyDataSource,
  AnyFlatFileDataSource,
  DuckLakeCatalog,
  IcebergCatalog,
  LocalDB,
  MotherDuckConnection,
  PersistentDataSourceId,
  QuackConnection,
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

  if (
    obj.type === 'attached-db' ||
    obj.type === 'remote-db' ||
    obj.type === 'iceberg-catalog' ||
    obj.type === 'ducklake-catalog' ||
    obj.type === 'quack' ||
    obj.type === 'motherduck'
  ) {
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
  dataSourceOrId: DatabaseDataSource | PersistentDataSourceId,
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
): DatabaseDataSource {
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

  if (!isDatabaseDataSource(obj)) {
    throw new Error(`Data source with id ${obj.id} is not a database data source`);
  }

  return obj;
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

export function isIcebergCatalog(dataSource: AnyDataSource): dataSource is IcebergCatalog {
  return dataSource.type === 'iceberg-catalog';
}

export function isDuckLakeCatalog(dataSource: AnyDataSource): dataSource is DuckLakeCatalog {
  return dataSource.type === 'ducklake-catalog';
}

export function isQuackConnection(dataSource: AnyDataSource): dataSource is QuackConnection {
  return dataSource.type === 'quack';
}

export function isMotherDuckConnection(
  dataSource: AnyDataSource,
): dataSource is MotherDuckConnection {
  return dataSource.type === 'motherduck';
}

// ──────────────────────────────────────────────────────────────────
// MotherDuck metadata key helpers.
//
// MotherDuck database metadata is stored with an "md:" prefix to avoid
// collisions with local databases (e.g. "md:my_db"). The bare "md:"
// value is the root identifier for the connection itself (returned by
// getDatabaseIdentifier) and does NOT represent a specific database.
// ──────────────────────────────────────────────────────────────────

/** Prefix used when keying per-database MotherDuck metadata. */
export const MD_DB_PREFIX = 'md:';

/** Builds a metadata key for a MotherDuck database (e.g. "md:my_db"). */
export function formatMotherDuckDbKey(dbName: string): string {
  return `${MD_DB_PREFIX}${dbName}`;
}

/** Returns true if `key` is a per-database MotherDuck metadata key (not the bare "md:" root). */
export function isMotherDuckDbKey(key: string): boolean {
  return key.startsWith(MD_DB_PREFIX) && key !== MD_DB_PREFIX;
}

/** Strips the "md:" prefix, returning the plain database name. Returns null for non-MD keys. */
export function parseMotherDuckDbKey(key: string): string | null {
  if (!isMotherDuckDbKey(key)) return null;
  return key.slice(MD_DB_PREFIX.length);
}

export type DatabaseDataSource =
  | LocalDB
  | RemoteDB
  | IcebergCatalog
  | DuckLakeCatalog
  | QuackConnection
  | MotherDuckConnection;

export function isDatabaseDataSource(dataSource: AnyDataSource): dataSource is DatabaseDataSource {
  return (
    dataSource.type === 'attached-db' ||
    dataSource.type === 'remote-db' ||
    dataSource.type === 'iceberg-catalog' ||
    dataSource.type === 'ducklake-catalog' ||
    dataSource.type === 'quack' ||
    dataSource.type === 'motherduck'
  );
}

/**
 * Returns the DuckDB database name for a database data source.
 * For Iceberg/DuckLake catalogs this is the catalog alias; for local, remote, and Quack
 * sources this is the attached database name. MotherDuck connections don't have a single
 * database name — returns the bare MD_DB_PREFIX.
 */
export function getDatabaseIdentifier(dataSource: DatabaseDataSource): string {
  if (dataSource.type === 'iceberg-catalog') return dataSource.catalogAlias;
  if (dataSource.type === 'ducklake-catalog') return dataSource.catalogAlias;
  if (dataSource.type === 'motherduck') return MD_DB_PREFIX;
  return dataSource.dbName;
}

export function getFlatFileDataSourceFromMap(
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
): AnyFlatFileDataSource[] {
  return Array.from(dataSources.values()).filter(isFlatFileDataSource);
}
