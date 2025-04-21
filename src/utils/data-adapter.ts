import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { ColumnAggregateType, DataAdapterQueries } from '@models/data-adapter';
import { AnyDataSource, AnyFlatFileDataSource, AttachedDB } from '@models/data-source';
import { DBColumn } from '@models/db';
import { LocalEntry, LocalFile } from '@models/file-system';
import { AnyFileSourceTab, AttachedDBDataTab, ScriptTab, TabReactiveState } from '@models/tab';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { classifySQLStatement, trimQuery } from './editor/sql';
import { convertArrowTable } from './arrow';

function getGetSortableReaderApiFromFQN(
  pool: AsyncDuckDBConnectionPool,
  fqn: string,
): DataAdapterQueries['getSortableReader'] {
  return async (sort) => {
    let baseQuery = `SELECT * FROM ${fqn}`;

    if (sort.length > 0) {
      const orderBy = sort
        .map((s) => `${toDuckDBIdentifier(s.column)} ${s.order || 'asc'}`)
        .join(', ');
      baseQuery += ` ORDER BY ${orderBy}`;
    }
    const reader = await pool.send(baseQuery, true);
    return reader;
  };
}

function getGetColumnAggregateFromFQN(
  pool: AsyncDuckDBConnectionPool,
  fqn: string,
): DataAdapterQueries['getColumnAggregate'] {
  return async (columnName: string, aggType: ColumnAggregateType) => {
    const queryToRun = `SELECT ${aggType}(${toDuckDBIdentifier(columnName)}) FROM ${fqn}`;
    const result = await pool.query(queryToRun);
    return result.getChildAt(0)?.get(0);
  };
}

function getgetColumnsDataApiFromFQN(
  pool: AsyncDuckDBConnectionPool,
  fqn: string,
): DataAdapterQueries['getColumnsData'] {
  return async (columns: DBColumn[]) => {
    const columnNames = columns.map((col) => toDuckDBIdentifier(col.name)).join(', ');
    const queryToRun = `SELECT ${columnNames} FROM ${fqn}`;
    const result = convertArrowTable(await pool.query(queryToRun));
    return result;
  };
}

function getFlatFileDataAdapterApi(
  pool: AsyncDuckDBConnectionPool,
  dataSource: AnyFlatFileDataSource,
  sourceFile: LocalFile,
): DataAdapterQueries {
  const fqn = `main.${toDuckDBIdentifier(dataSource.viewName)}`;

  const baseAttrs: Partial<DataAdapterQueries> = {
    getSortableReader: getGetSortableReaderApiFromFQN(pool, fqn),
    getColumnAggregate: getGetColumnAggregateFromFQN(pool, fqn),
    getColumnsData: getgetColumnsDataApiFromFQN(pool, fqn),
  };

  if (dataSource.type === 'xlsx-sheet') {
    return {
      ...baseAttrs,
      // TODO: implement this
      getEstimatedRowCount: undefined,
    };
  }

  if (dataSource.type === 'csv' || dataSource.type === 'json') {
    return {
      ...baseAttrs,
      // TODO: we can enable sampling in multi-threaded mode. In single
      // threaded, count enforces a full scan and blocks quick streaming reads
      // getEstimatedRowCount: async () => {
      //   const result = await pool.query(
      //     `SELECT count(*) * 10 FROM ${toDuckDBIdentifier(dataSource.viewName)} USING SAMPLE 10% (system)`,
      //   );

      //   const count = Number(result.getChildAt(0)?.get(0));
      //   return count;
      // },
    };
  }

  if (dataSource.type === 'parquet') {
    return {
      ...baseAttrs,
      getRowCount: async () => {
        const result = await pool.query(
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
  pool: AsyncDuckDBConnectionPool,
  dataSource: AttachedDB,
  tab: TabReactiveState<AttachedDBDataTab>,
): { adapter: DataAdapterQueries | null; userErrors: string[]; internalErrors: string[] } {
  const dbName = toDuckDBIdentifier(dataSource.dbName);
  const schemaName = toDuckDBIdentifier(tab.schemaName);
  const tableName = toDuckDBIdentifier(tab.objectName);
  const fqn = `${dbName}.${schemaName}.${tableName}`;

  return {
    adapter: {
      getEstimatedRowCount:
        dataSource.dbType === 'duckdb'
          ? tab.objectType === 'table'
            ? async () => {
                const result = await pool.query(
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
      getSortableReader: getGetSortableReaderApiFromFQN(pool, fqn),
      getColumnAggregate: getGetColumnAggregateFromFQN(pool, fqn),
      getColumnsData: getgetColumnsDataApiFromFQN(pool, fqn),
    },
    userErrors: [],
    internalErrors: [],
  };
}

export function getFileDataAdapterQueries({
  pool,
  dataSource,
  tab,
  sourceFile,
}: {
  pool: AsyncDuckDBConnectionPool;
  dataSource: AnyDataSource | undefined;
  tab: TabReactiveState<AnyFileSourceTab>;
  sourceFile: LocalEntry | undefined;
}): { adapter: DataAdapterQueries | null; userErrors: string[]; internalErrors: string[] } {
  if (!dataSource || !sourceFile) {
    return {
      adapter: null,
      userErrors: [],
      internalErrors: ['Data source or source file are missing for the tab'],
    };
  }

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

    return getAttachedDBDataAdapterApi(pool, dataSource, tab);
  }

  if (
    dataSource.type === 'csv' ||
    dataSource.type === 'json' ||
    dataSource.type === 'xlsx-sheet' ||
    dataSource.type === 'parquet'
  ) {
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
      adapter: getFlatFileDataAdapterApi(pool, dataSource, sourceFile),
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

export function getScriptAdapterQueries({
  pool,
  tab,
}: {
  pool: AsyncDuckDBConnectionPool;
  tab: TabReactiveState<ScriptTab>;
}): { adapter: DataAdapterQueries | null; userErrors: string[]; internalErrors: string[] } {
  const { lastExecutedQuery } = tab;

  if (!lastExecutedQuery) {
    // No query, means no data source means empty queries
    return {
      adapter: null,
      userErrors: [],
      internalErrors: [],
    };
  }

  const classifiedStmt = classifySQLStatement(lastExecutedQuery);

  const trimmedQuery = trimQuery(lastExecutedQuery);

  return {
    adapter: {
      // As of today we do not allow runnig even an estimated row count on
      // arbitrary queries, so we do no create these functions
      getSortableReader: classifiedStmt.isAllowedInSubquery
        ? async (sort) => {
            let queryToRun = trimmedQuery;

            if (sort.length > 0) {
              const orderBy = sort.map((s) => `${s.column} ${s.order || 'asc'}`).join(', ');
              queryToRun = `SELECT * FROM (${trimmedQuery}) ORDER BY ${orderBy}`;
            }
            const reader = await pool.send(queryToRun, true);
            return reader;
          }
        : undefined,
      getReader: !classifiedStmt.isAllowedInSubquery
        ? async () => {
            const reader = await pool.send(trimmedQuery, true);
            return reader;
          }
        : undefined,
      getColumnAggregate: classifiedStmt.isAllowedInSubquery
        ? async (columnName: string, aggType: ColumnAggregateType) => {
            const queryToRun = `SELECT ${aggType}(${columnName}) FROM (${trimmedQuery})`;
            const result = await pool.query(queryToRun);
            return result.getChildAt(0)?.get(0);
          }
        : undefined,
      getColumnsData: classifiedStmt.isAllowedInSubquery
        ? async (columns: DBColumn[]) => {
            const columnNames = columns.map((col) => toDuckDBIdentifier(col.name)).join(', ');
            const queryToRun = `SELECT ${columnNames} FROM (${trimmedQuery})`;
            const result = convertArrowTable(await pool.query(queryToRun));
            return result;
          }
        : undefined,
    },
    userErrors: [],
    internalErrors: [],
  };
}
