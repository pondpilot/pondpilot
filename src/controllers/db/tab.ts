import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { DataAdapterApi } from '@models/data-adapter';
import { AnyDataSource, AnyFlatFileDataSource, AttachedDB } from '@models/data-source';
import { DataViewCacheKey } from '@models/data-view';
import { LocalEntry } from '@models/file-system';
import { AnyFileSourceTab, AttachedDBDataTab, FlatFileDataSourceTab } from '@models/tab';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';

function getFlatFileGetReaderApi(
  conn: AsyncDuckDBConnection,
  dataSource: AnyFlatFileDataSource,
): DataAdapterApi['getReader'] {
  return async (sort) => {
    let baseQuery = `SELECT * FROM main.${toDuckDBIdentifier(dataSource.viewName)}`;

    if (sort.length > 0) {
      const orderBy = sort.map((s) => `${s.column} ${s.order || 'asc'}`).join(', ');
      baseQuery += ` ORDER BY ${orderBy}`;
    }
    const reader = await conn.send(baseQuery);
    return reader;
  };
}

function getFlatFileDataAdapterApi(
  conn: AsyncDuckDBConnection,
  dataSource: AnyFlatFileDataSource,
  tab: FlatFileDataSourceTab,
  sourceFile: LocalEntry,
): DataAdapterApi {
  if (dataSource.type === 'csv') {
    return {
      getCacheKey: () => tab.id as unknown as DataViewCacheKey,
      getRowCount: undefined,
      // TODO: implement this
      getEstimatedRowCount: undefined,
      getReader: getFlatFileGetReaderApi(conn, dataSource),
    };
  }

  if (dataSource.type === 'parquet') {
    return {
      getCacheKey: () => tab.id as unknown as DataViewCacheKey,
      getRowCount: async () => {
        const result = await conn.query(
          `SELECT num_rows FROM parquet_file_metadata('${sourceFile.uniqueAlias}')`,
        );

        const count = Number(result.getChildAt(0)?.get(0));
        return count;
      },
      getReader: getFlatFileGetReaderApi(conn, dataSource),
    };
  }

  const _: never = dataSource;
  throw new Error('Unexpected data source type');
}

function getAttachedDBDataAdapterApi(
  conn: AsyncDuckDBConnection,
  dataSource: AttachedDB,
  tab: AttachedDBDataTab,
): { adapter: DataAdapterApi | null; userErrors: string[]; internalErrors: string[] } {
  const dbName = toDuckDBIdentifier(dataSource.dbName);
  const schemaName = toDuckDBIdentifier(tab.schemaName);
  const tableName = toDuckDBIdentifier(tab.objectName);
  const fqn = `${dbName}.${schemaName}.${tableName}`;

  // First check that the object actually exists (user may have deleted it)
  try {
    conn.query(`SELECT * FROM ${fqn} LIMIT 0;`);
  } catch (error) {
    // TODO: currently assumes any type of error means the object doesn't exist
    // which is not true for all cases
    return {
      adapter: null,
      userErrors: [`The ${tab.objectType} ${fqn} does not exist anymore.`],
      internalErrors: [],
    };
  }

  return {
    adapter: {
      getCacheKey: () => tab.id as unknown as DataViewCacheKey,
      getEstimatedRowCount:
        dataSource.dbType === 'duckdb'
          ? tab.objectType === 'table'
            ? async () => {
                const result = await conn.query(
                  `SELECT estimated_size 
                FROM duckdb_tables
                WHERE
                  database_name = '${dbName}'
                  AND schema_name = '${schemaName}'
                  AND table_name = '${tableName}';
                ;`,
                );

                const count = Number(result.getChildAt(0)?.get(0));
                return count;
              }
            : undefined
          : undefined,
      getReader: async (sort) => {
        let baseQuery = `SELECT * FROM ${fqn}`;

        if (sort.length > 0) {
          const orderBy = sort.map((s) => `${s.column} ${s.order || 'asc'}`).join(', ');
          baseQuery += ` ORDER BY ${orderBy}`;
        }
        const reader = await conn.send(baseQuery);
        return reader;
      },
    },
    userErrors: [],
    internalErrors: [],
  };
}

export function getFileDataAdapterApi(
  conn: AsyncDuckDBConnection,
  dataSource: AnyDataSource,
  tab: AnyFileSourceTab,
  sourceFile: LocalEntry,
): { adapter: DataAdapterApi | null; userErrors: string[]; internalErrors: string[] } {
  if (dataSource.type === 'attached-db') {
    if (tab.dataSourceType !== 'db') {
      return {
        adapter: null,
        userErrors: [],
        internalErrors: [
          `Tried creating an attached db object data adapter from a tab with different source type: ${tab.dataSourceType}`,
        ],
      };
    }

    return getAttachedDBDataAdapterApi(conn, dataSource, tab);
  }

  if (dataSource.type === 'csv' || dataSource.type === 'parquet') {
    if (tab.dataSourceType !== 'file') {
      return {
        adapter: null,
        userErrors: [],
        internalErrors: [
          `Tried creating a flat file data adapter from a tab with different source type: ${tab.dataSourceType}`,
        ],
      };
    }

    return {
      adapter: getFlatFileDataAdapterApi(conn, dataSource, tab, sourceFile),
      userErrors: [],
      internalErrors: [],
    };
  }

  const _: never = dataSource;
  return {
    adapter: null,
    userErrors: [],
    internalErrors: [`Unexpected unsupported data source type: ${dataSource}`],
  };
}
