import { getFileReferenceForDuckDB } from '@controllers/file-system/file-helpers';
import { ConnectionPool } from '@engines/types';
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
import { useAppStore } from '@store/app-store';
import { isTauriEnvironment } from '@utils/browser';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';

import { convertArrowTable } from './arrow';
import { classifySQLStatement, trimQuery } from './editor/sql';
import { quote } from './helpers';

// Initial batch size for table preview - 10K rows provides a fast first paint
// and keeps batch counts and backend work low on very large datasets
const INITIAL_TABLE_PREVIEW_LIMIT = 10000;

function getGetSortableReaderApiFromFQN(
  pool: ConnectionPool,
  fqn: string,
  attach?: { dbName: string; url: string; readOnly?: boolean },
): DataAdapterQueries['getSortableReader'] {
  return async (sort, abortSignal) => {
    // For initial table preview, add a reasonable LIMIT to prevent scanning entire large tables
    // This is especially important for CSV files which require full scans
    let baseQuery = `SELECT * FROM ${fqn} LIMIT ${INITIAL_TABLE_PREVIEW_LIMIT}`;

    if (sort.length > 0) {
      const orderBy = sort
        .map((s) => `${toDuckDBIdentifier(s.column)} ${s.order || 'asc'}`)
        .join(', ');
      // When sorting, we need to wrap the limited query in a subquery
      baseQuery = `SELECT * FROM (SELECT * FROM ${fqn} LIMIT ${INITIAL_TABLE_PREVIEW_LIMIT}) ORDER BY ${orderBy}`;
    }
    if (!pool.sendAbortable) {
      throw new Error('Connection pool does not support sendAbortable');
    }
    const reader = await pool.sendAbortable(
      baseQuery,
      abortSignal,
      true,
      attach ? { attach } : undefined,
    );
    return reader;
  };
}

function getGetColumnAggregateFromFQN(
  pool: ConnectionPool,
  fqn: string,
  _attach?: { dbName: string; url: string; readOnly?: boolean },
): DataAdapterQueries['getColumnAggregate'] {
  return async (columnName: string, aggType: ColumnAggregateType, abortSignal: AbortSignal) => {
    const queryToRun = `SELECT ${aggType}(${toDuckDBIdentifier(columnName)}) FROM ${fqn}`;
    if (!pool.queryAbortable) {
      throw new Error('Connection pool does not support queryAbortable');
    }
    const { value, aborted } = await pool.queryAbortable(queryToRun, abortSignal);

    if (aborted) {
      return { value: undefined, aborted };
    }
    return { value: value.getChildAt(0)?.get(0), aborted };
  };
}

function getGetColumnsDataApiFromFQN(
  pool: ConnectionPool,
  fqn: string,
  _attach?: { dbName: string; url: string; readOnly?: boolean },
): DataAdapterQueries['getColumnsData'] {
  return async (columns: DBColumn[], abortSignal: AbortSignal) => {
    const columnNames = columns.map((col) => toDuckDBIdentifier(col.name)).join(', ');
    const queryToRun = `SELECT ${columnNames} FROM ${fqn}`;
    if (!pool.queryAbortable) {
      throw new Error('Connection pool does not support queryAbortable');
    }
    const { value, aborted } = await pool.queryAbortable(queryToRun, abortSignal);

    if (aborted) {
      return { value: [], aborted };
    }
    return { value: convertArrowTable(value, columns), aborted };
  };
}

function getFlatFileDataAdapterQueries(
  pool: ConnectionPool,
  dataSource: AnyFlatFileDataSource,
  sourceFile: LocalFile,
): DataAdapterQueries {
  // Use FQN appropriate to environment:
  // - Tauri (native DuckDB): use unqualified <view> to avoid cross-database/schema mismatches
  // - Web/WASM (OPFS persistent DB named 'pondpilot'): use pondpilot.main.<view>
  const fqn = isTauriEnvironment()
    ? `${toDuckDBIdentifier(dataSource.viewName)}`
    : `${toDuckDBIdentifier(SYSTEM_DATABASE_NAME)}.main.${toDuckDBIdentifier(dataSource.viewName)}`;

  const baseAttrs: Partial<DataAdapterQueries> = {
    getSortableReader: getGetSortableReaderApiFromFQN(pool, fqn),
    getColumnAggregate: getGetColumnAggregateFromFQN(pool, fqn),
    getColumnsData: getGetColumnsDataApiFromFQN(pool, fqn),
  };

  if (
    dataSource.type === 'csv' ||
    dataSource.type === 'json' ||
    dataSource.type === 'xlsx-sheet' ||
    dataSource.type === 'sas7bdat' ||
    dataSource.type === 'xpt' ||
    dataSource.type === 'sav' ||
    dataSource.type === 'zsav' ||
    dataSource.type === 'por' ||
    dataSource.type === 'dta'
  ) {
    return {
      ...baseAttrs,
      // Don't provide getRowCount for CSV/JSON/XLSX/Statistical files as it requires scanning entire file
      // which is expensive for large files. The UI will progressively load data instead.
    };
  }

  if (dataSource.type === 'parquet') {
    return {
      ...baseAttrs,
      getRowCount: async (abortSignal: AbortSignal) => {
        if (!pool.queryAbortable) {
          throw new Error('Connection pool does not support queryAbortable');
        }
        const { value, aborted } = await pool.queryAbortable(
          `SELECT num_rows FROM parquet_file_metadata('${sourceFile.uniqueAlias}.${sourceFile.ext}')`,
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
  pool: ConnectionPool,
  dataSource: LocalDB | RemoteDB,
  tab: TabReactiveState<LocalDBDataTab>,
): { adapter: DataAdapterQueries | null; userErrors: string[]; internalErrors: string[] } {
  const dbIdent = toDuckDBIdentifier(dataSource.dbName);
  const schemaIdent = toDuckDBIdentifier(tab.schemaName);
  const tableIdent = toDuckDBIdentifier(tab.objectName);
  const fqn = `${dbIdent}.${schemaIdent}.${tableIdent}`;
  const attach = (() => {
    // Remote DBs always need ATTACH on each new streaming connection
    if ((dataSource as RemoteDB).type === 'remote-db') {
      return {
        dbName: (dataSource as RemoteDB).dbName,
        url: (dataSource as RemoteDB).legacyUrl || '',
        readOnly: true,
      };
    }

    // Local attached DBs are session-scoped. For Tauri, streaming uses a fresh connection,
    // so we must re-attach using the original file path.
    if (isTauriEnvironment() && (dataSource as LocalDB).type === 'attached-db') {
      try {
        const { localEntries } = useAppStore.getState();
        const entry = localEntries.get((dataSource as LocalDB).fileSourceId);
        if (entry && entry.kind === 'file' && entry.fileType === 'data-source') {
          const url = getFileReferenceForDuckDB(entry);
          return {
            dbName: (dataSource as LocalDB).dbName,
            url,
            readOnly: true,
          };
        }
      } catch (error) {
        // Log the error for debugging purposes
        console.warn('Failed to build attach specification for local DB streaming:', {
          dbName: (dataSource as LocalDB).dbName,
          fileSourceId: (dataSource as LocalDB).fileSourceId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through without attach; query will error and be reported to user
      }
    }
    return undefined;
  })();

  return {
    adapter: {
      getEstimatedRowCount:
        (dataSource.type === 'attached-db' && dataSource.dbType === 'duckdb')
          ? tab.objectType === 'table'
            ? async (abortSignal: AbortSignal) => {
                if (!pool.queryAbortable) {
                  throw new Error('Connection pool does not support queryAbortable');
                }
                const { value, aborted } = await pool.queryAbortable(
                  `SELECT estimated_size 
                FROM duckdb_tables
                WHERE
                  database_name = ${quote(dataSource.dbName, { single: true })}
                  AND schema_name = ${quote(tab.schemaName, { single: true })}
                  AND table_name = ${quote(tab.objectName, { single: true })};
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
      getSortableReader: getGetSortableReaderApiFromFQN(pool, fqn, attach),
      getColumnAggregate: getGetColumnAggregateFromFQN(pool, fqn, attach),
      getColumnsData: getGetColumnsDataApiFromFQN(pool, fqn, attach),
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
  pool: ConnectionPool;
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
    dataSource.type === 'parquet' ||
    dataSource.type === 'sas7bdat' ||
    dataSource.type === 'xpt' ||
    dataSource.type === 'sav' ||
    dataSource.type === 'zsav' ||
    dataSource.type === 'por' ||
    dataSource.type === 'dta'
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
  pool: ConnectionPool;
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
            if (!pool.sendAbortable) {
              throw new Error('Connection pool does not support sendAbortable');
            }
            const reader = await pool.sendAbortable(queryToRun, abortSignal, true);
            return reader;
          }
        : undefined,
      getReader: !classifiedStmt.isAllowedInSubquery
        ? async (abortSignal) => {
            if (!pool.sendAbortable) {
              throw new Error('Connection pool does not support sendAbortable');
            }
            const reader = await pool.sendAbortable(trimmedQuery, abortSignal, true);
            return reader;
          }
        : undefined,
      getColumnAggregate: classifiedStmt.isAllowedInSubquery
        ? async (columnName: string, aggType: ColumnAggregateType, abortSignal: AbortSignal) => {
            const queryToRun = `SELECT ${aggType}(${columnName}) FROM (${trimmedQuery})`;
            if (!pool.queryAbortable) {
              throw new Error('Connection pool does not support queryAbortable');
            }
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
            if (!pool.queryAbortable) {
              throw new Error('Connection pool does not support queryAbortable');
            }
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
