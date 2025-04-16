import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { DataAdapterApi } from '@models/data-adapter';
import { AnyDataSource, AnyFlatFileDataSource, AttachedDB } from '@models/data-source';
import { DBTableOrViewSchema } from '@models/db';
import { LocalEntry, LocalFile } from '@models/file-system';
import { AnyFileSourceTab, AttachedDBDataTab, FlatFileDataSourceTab } from '@models/tab';
import { isNumberType } from '@utils/db';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { quote } from '@utils/helpers';

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
    const reader = await conn.send(baseQuery, true);
    return reader;
  };
}

function getFlatFileColumnCalculator(
  conn: AsyncDuckDBConnection,
  dataSource: AnyFlatFileDataSource,
): DataAdapterApi['getCalculatedColumnSummary'] {
  return async (column) => {
    const isNumeric = isNumberType(column.sqlType);
    const sourceIdentifier = `main.${toDuckDBIdentifier(dataSource.viewName)}`;

    const summaryQuery = `SELECT ${isNumeric ? 'sum' : 'count'}("${column.name}") AS total FROM ${sourceIdentifier}`;

    const result = await conn.query(summaryQuery);
    return Number(result.getChildAt(0)?.get(0));
  };
}

function getFlatFileColumnsData(
  conn: AsyncDuckDBConnection,
  dataSource: AnyFlatFileDataSource,
): DataAdapterApi['getColumnsData'] {
  return async (selectedColumns) => {
    const columnsString = selectedColumns.map((col) => quote(col.name)).join(', ');
    const sourceIdentifier = `main.${toDuckDBIdentifier(dataSource.viewName)}`;

    const query = `SELECT ${columnsString} FROM ${sourceIdentifier}`;
    return conn.query(query);
  };
}

function getFlatFileDataAdapterApi(
  conn: AsyncDuckDBConnection,
  dataSource: AnyFlatFileDataSource,
  schema: DBTableOrViewSchema,
  tab: FlatFileDataSourceTab,
  sourceFile: LocalFile,
): DataAdapterApi {
  const baseAttrs = {
    getCacheKey: () => tab.id,
    getSchema: () => schema,
    getReader: getFlatFileGetReaderApi(conn, dataSource),
    getCalculatedColumnSummary: getFlatFileColumnCalculator(conn, dataSource),
    getColumnsData: getFlatFileColumnsData(conn, dataSource),
  };

  if (dataSource.type === 'csv') {
    return {
      ...baseAttrs,
      // TODO: implement this
      getEstimatedRowCount: undefined,
    };
  }

  if (dataSource.type === 'parquet') {
    return {
      ...baseAttrs,
      getRowCount: async () => {
        const result = await conn.query(
          `SELECT num_rows FROM parquet_file_metadata('${sourceFile.uniqueAlias}.${sourceFile.ext}')`,
        );

        const count = Number(result.getChildAt(0)?.get(0));
        return count;
      },
    };
  }

  const _: never = dataSource;
  throw new Error('Unexpected data source type');
}

function getAttachedDBDataAdapterApi(
  conn: AsyncDuckDBConnection,
  dataSource: AttachedDB,
  schema: DBTableOrViewSchema,
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
      getCacheKey: () => tab.id,
      getSchema: () => schema,
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
        const reader = await conn.send(baseQuery, true);
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
  schema: DBTableOrViewSchema,
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

    return getAttachedDBDataAdapterApi(conn, dataSource, schema, tab);
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

    if (sourceFile.kind !== 'file') {
      return {
        adapter: null,
        userErrors: [],
        internalErrors: [
          `Tried creating a flat file data adapter from a directory: ${sourceFile.id}`,
        ],
      };
    }

    return {
      adapter: getFlatFileDataAdapterApi(conn, dataSource, schema, tab, sourceFile),
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
