import { escapeSqlString } from '@components/ai-shared/utils/sql-escape';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { ColumnAggregateType, DataAdapterQueries } from '@models/data-adapter';
import {
  AnyDataSource,
  AnyFlatFileDataSource,
  LocalDB,
  RemoteDB,
  SYSTEM_DATABASE_ID,
  SYSTEM_DATABASE_NAME,
} from '@models/data-source';
import { DBColumn } from '@models/db';
import { LocalEntry, LocalFile } from '@models/file-system';
import { AnyFileSourceTab, LocalDBDataTab, ScriptTab, TabReactiveState } from '@models/tab';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';

import { convertArrowTable } from './arrow';
import { classifySQLStatement, trimQuery } from './editor/sql';
import { quote } from './helpers';

function getGetSortableReaderApiFromFQN(
  pool: AsyncDuckDBConnectionPool,
  fqn: string,
): DataAdapterQueries['getSortableReader'] {
  return async (sort, abortSignal) => {
    let baseQuery = `SELECT * FROM ${fqn}`;

    if (sort.length > 0) {
      const orderBy = sort
        .map((s) => `${toDuckDBIdentifier(s.column)} ${s.order || 'asc'}`)
        .join(', ');
      baseQuery += ` ORDER BY ${orderBy}`;
    }
    const reader = await pool.sendAbortable(baseQuery, abortSignal, true);
    return reader;
  };
}

function getGetColumnAggregateFromFQN(
  pool: AsyncDuckDBConnectionPool,
  fqn: string,
): DataAdapterQueries['getColumnAggregate'] {
  return async (columnName: string, aggType: ColumnAggregateType, abortSignal: AbortSignal) => {
    const queryToRun = `SELECT ${aggType}(${toDuckDBIdentifier(columnName)}) FROM ${fqn}`;
    const { value, aborted } = await pool.queryAbortable(queryToRun, abortSignal);

    if (aborted) {
      return { value: undefined, aborted };
    }
    return { value: value.getChildAt(0)?.get(0), aborted };
  };
}

function getGetColumnsDataApiFromFQN(
  pool: AsyncDuckDBConnectionPool,
  fqn: string,
): DataAdapterQueries['getColumnsData'] {
  return async (columns: DBColumn[], abortSignal: AbortSignal) => {
    const columnNames = columns.map((col) => toDuckDBIdentifier(col.name)).join(', ');
    const queryToRun = `SELECT ${columnNames} FROM ${fqn}`;
    const { value, aborted } = await pool.queryAbortable(queryToRun, abortSignal);

    if (aborted) {
      return { value: [], aborted };
    }
    return { value: convertArrowTable(value, columns), aborted };
  };
}

function getFlatFileDataAdapterQueries(
  pool: AsyncDuckDBConnectionPool,
  dataSource: AnyFlatFileDataSource,
  sourceFile: LocalFile,
): DataAdapterQueries {
  const fqn = `main.${toDuckDBIdentifier(dataSource.viewName)}`;

  const baseAttrs: Partial<DataAdapterQueries> = {
    getSortableReader: getGetSortableReaderApiFromFQN(pool, fqn),
    getColumnAggregate: getGetColumnAggregateFromFQN(pool, fqn),
    getColumnsData: getGetColumnsDataApiFromFQN(pool, fqn),
  };

  if (dataSource.type === 'csv' || dataSource.type === 'json' || dataSource.type === 'xlsx-sheet') {
    return {
      ...baseAttrs,
      getRowCount: async (abortSignal: AbortSignal) => {
        const { value, aborted } = await pool.queryAbortable(
          `SELECT count(*) FROM ${toDuckDBIdentifier(dataSource.viewName)}`,
          abortSignal,
        );

        if (aborted) {
          // Value is not used when aborted, so doesn't matter
          return { value: 0, aborted };
        }
        return { value: Number(value.getChildAt(0)?.get(0)), aborted };
      },
    };
  }

  if (dataSource.type === 'parquet') {
    return {
      ...baseAttrs,
      getRowCount: async (abortSignal: AbortSignal) => {
        const { value, aborted } = await pool.queryAbortable(
          `SELECT num_rows FROM parquet_file_metadata('${escapeSqlString(`${sourceFile.uniqueAlias}.${sourceFile.ext}`)}')`,
          abortSignal,
        );

        if (aborted) {
          // Value is not used when aborted, so doesn't matter
          return { value: 0, aborted };
        }
        return { value: Number(value.getChildAt(0)?.get(0)), aborted };
      },
    };
  }

  const _: never = dataSource;
  throw new Error('Unexpected data source type');
}

// Generic function that works for both LocalDB and RemoteDB since they share the same interface
// for database operations (both have dbName and dbType fields)
function getDatabaseDataAdapterApi(
  pool: AsyncDuckDBConnectionPool,
  dataSource: LocalDB | RemoteDB,
  tab: TabReactiveState<LocalDBDataTab>,
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
            ? async (abortSignal: AbortSignal) => {
                const { value, aborted } = await pool.queryAbortable(
                  `SELECT estimated_size 
                FROM duckdb_tables
                WHERE
                  database_name = ${quote(dbName, { single: true })}
                  AND schema_name = ${quote(schemaName, { single: true })}
                  AND table_name = ${quote(tableName, { single: true })};
                ;`,
                  abortSignal,
                );

                if (aborted) {
                  // Value is not used when aborted, so doesn't matter
                  return { value: 0, aborted };
                }
                return { value: Number(value.getChildAt(0)?.get(0)), aborted };
              }
            : undefined
          : undefined,
      getSortableReader: getGetSortableReaderApiFromFQN(pool, fqn),
      getColumnAggregate: getGetColumnAggregateFromFQN(pool, fqn),
      getColumnsData: getGetColumnsDataApiFromFQN(pool, fqn),
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
  if (!dataSource) {
    return {
      adapter: null,
      userErrors: [],
      internalErrors: ['Data source is missing for the tab'],
    };
  }

  if (dataSource.type === 'attached-db') {
    if (tab.dataSourceType !== 'db') {
      return {
        adapter: null,
        userErrors: [],
        internalErrors: [
          `Tried creating a local db object data adapter from a tab with different source type: ${tab.dataSourceType}`,
        ],
      };
    }

    // For system database (pondpilot-system-db), we don't need a source file
    if (dataSource.id === SYSTEM_DATABASE_ID || dataSource.dbName === SYSTEM_DATABASE_NAME) {
      return getDatabaseDataAdapterApi(pool, dataSource, tab);
    }

    // For other local databases, we need a source file
    if (!sourceFile) {
      return {
        adapter: null,
        userErrors: [],
        internalErrors: ['Source file is missing for the local database'],
      };
    }

    return getDatabaseDataAdapterApi(pool, dataSource, tab);
  }

  if (dataSource.type === 'remote-db') {
    if (tab.dataSourceType !== 'db') {
      return {
        adapter: null,
        userErrors: [],
        internalErrors: [
          `Tried creating a remote db object data adapter from a tab with different source type: ${tab.dataSourceType}`,
        ],
      };
    }

    // Check connection state
    if (dataSource.connectionState !== 'connected') {
      return {
        adapter: null,
        userErrors: [`Remote database '${dataSource.dbName}' is not connected`],
        internalErrors: [],
      };
    }

    // Remote databases use the same logic as local databases
    return getDatabaseDataAdapterApi(pool, dataSource, tab);
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

    if (!sourceFile) {
      return {
        adapter: null,
        userErrors: [],
        internalErrors: ['Source file is missing for the flat file data source'],
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
      adapter: getFlatFileDataAdapterQueries(pool, dataSource, sourceFile),
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
        ? async (sort, abortSignal) => {
            let queryToRun = trimmedQuery;

            if (sort.length > 0) {
              const orderBy = sort
                .map((s) => `${toDuckDBIdentifier(s.column)} ${s.order || 'asc'}`)
                .join(', ');
              queryToRun = `SELECT * FROM (${trimmedQuery}) ORDER BY ${orderBy}`;
            }
            const reader = await pool.sendAbortable(queryToRun, abortSignal, true);
            return reader;
          }
        : undefined,
      getReader: !classifiedStmt.isAllowedInSubquery
        ? async (abortSignal) => {
            const reader = await pool.sendAbortable(trimmedQuery, abortSignal, true);
            return reader;
          }
        : undefined,
      getColumnAggregate: classifiedStmt.isAllowedInSubquery
        ? async (columnName: string, aggType: ColumnAggregateType, abortSignal: AbortSignal) => {
            const queryToRun = `SELECT ${aggType}(${columnName}) FROM (${trimmedQuery})`;
            const { value, aborted } = await pool.queryAbortable(queryToRun, abortSignal);

            if (aborted) {
              return { value: undefined, aborted };
            }
            return { value: value.getChildAt(0)?.get(0), aborted };
          }
        : undefined,
      getColumnsData: classifiedStmt.isAllowedInSubquery
        ? async (columns: DBColumn[], abortSignal: AbortSignal) => {
            const columnNames = columns.map((col) => toDuckDBIdentifier(col.name)).join(', ');
            const queryToRun = `SELECT ${columnNames} FROM (${trimmedQuery})`;
            const { value, aborted } = await pool.queryAbortable(queryToRun, abortSignal);

            if (aborted) {
              return { value: [], aborted };
            }
            return { value: convertArrowTable(value, columns), aborted };
          }
        : undefined,
    },
    userErrors: [],
    internalErrors: [],
  };
}
