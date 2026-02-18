import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import {
  ChartAggregatedData,
  ChartAggregationType,
  ChartSortOrder,
  ColumnAggregateType,
  DataAdapterQueries,
} from '@models/data-adapter';
import {
  AnyDataSource,
  AnyFlatFileDataSource,
  IcebergCatalog,
  LocalDB,
  RemoteDB,
  SYSTEM_DATABASE_ID,
  SYSTEM_DATABASE_NAME,
} from '@models/data-source';
import { DBColumn } from '@models/db';
import { LocalEntry, LocalFile } from '@models/file-system';
import { AnyFileSourceTab, LocalDBDataTab, ScriptTab, TabReactiveState } from '@models/tab';
import { getDatabaseIdentifier } from '@utils/data-source';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';

import { convertArrowTable } from './arrow';
import { isFlatFileDataSource } from './data-source';
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

/**
 * Maximum number of unique X-axis values to return from chart aggregation.
 * Prevents excessive data when grouping by high-cardinality columns.
 */
const MAX_CHART_GROUPS = 1000;

/**
 * Builds the SQL query for chart data aggregation.
 * When aggregation is 'none', values are used directly without aggregation.
 */
export function buildChartAggregationQuery(
  source: string,
  xColumn: string,
  yColumn: string,
  aggregation: ChartAggregationType,
  groupByColumn: string | null,
  sortBy: 'x' | 'y',
  sortOrder: ChartSortOrder | null,
): string {
  const xCol = toDuckDBIdentifier(xColumn);
  const yCol = toDuckDBIdentifier(yColumn);

  let selectClause: string;
  let groupByClause: string;

  if (aggregation === 'none') {
    // No aggregation - use values directly
    if (groupByColumn) {
      const groupCol = toDuckDBIdentifier(groupByColumn);
      selectClause = `CAST(${xCol} AS VARCHAR) AS x, CAST(${groupCol} AS VARCHAR) AS grp, ${yCol} AS y`;
      groupByClause = '';
    } else {
      selectClause = `CAST(${xCol} AS VARCHAR) AS x, ${yCol} AS y`;
      groupByClause = '';
    }
  } else {
    const agg = aggregation.toUpperCase();
    if (groupByColumn) {
      const groupCol = toDuckDBIdentifier(groupByColumn);
      selectClause = `CAST(${xCol} AS VARCHAR) AS x, CAST(${groupCol} AS VARCHAR) AS grp, ${agg}(${yCol}) AS y`;
      groupByClause = `GROUP BY ${xCol}, ${groupCol}`;
    } else {
      selectClause = `CAST(${xCol} AS VARCHAR) AS x, ${agg}(${yCol}) AS y`;
      groupByClause = `GROUP BY ${xCol}`;
    }
  }

  let orderByClause = '';
  if (sortOrder) {
    const sortCol = sortBy === 'x' ? 'x' : 'y';
    orderByClause = `ORDER BY ${sortCol} ${sortOrder.toUpperCase()}`;
  }

  const whereClause = `WHERE ${xCol} IS NOT NULL`;

  return `SELECT ${selectClause} FROM ${source} ${whereClause} ${groupByClause} ${orderByClause} LIMIT ${MAX_CHART_GROUPS}`;
}

/**
 * Converts Arrow table result to ChartAggregatedData format.
 */
function convertArrowToChartData(arrowTable: any, hasGroupColumn: boolean): ChartAggregatedData {
  const result: ChartAggregatedData = [];
  const { numRows } = arrowTable;

  const xColumn = arrowTable.getChildAt(0);
  const yColumn = hasGroupColumn ? arrowTable.getChildAt(2) : arrowTable.getChildAt(1);
  const groupColumn = hasGroupColumn ? arrowTable.getChildAt(1) : null;

  for (let i = 0; i < numRows; i += 1) {
    const x = xColumn?.get(i);
    const y = yColumn?.get(i);
    const group = groupColumn?.get(i);

    if (x != null && y != null) {
      const point: ChartAggregatedData[number] = {
        x: String(x),
        y: typeof y === 'bigint' ? Number(y) : y,
      };
      if (hasGroupColumn && group != null) {
        point.group = String(group);
      }
      result.push(point);
    }
  }

  return result;
}

function getGetChartAggregatedDataFromFQN(
  pool: AsyncDuckDBConnectionPool,
  fqn: string,
): DataAdapterQueries['getChartAggregatedData'] {
  return async (
    xColumn: string,
    yColumn: string,
    aggregation: ChartAggregationType,
    groupByColumn: string | null,
    sortBy: 'x' | 'y',
    sortOrder: ChartSortOrder | null,
    abortSignal: AbortSignal,
  ) => {
    const query = buildChartAggregationQuery(
      fqn,
      xColumn,
      yColumn,
      aggregation,
      groupByColumn,
      sortBy,
      sortOrder,
    );

    const { value, aborted } = await pool.queryAbortable(query, abortSignal);

    if (aborted) {
      return { value: [], aborted };
    }

    return { value: convertArrowToChartData(value, groupByColumn !== null), aborted };
  };
}

function getFlatFileDataAdapterQueries(
  pool: AsyncDuckDBConnectionPool,
  dataSource: AnyFlatFileDataSource,
  sourceFile?: LocalFile,
): DataAdapterQueries {
  const fqn = `main.${toDuckDBIdentifier(dataSource.viewName)}`;

  const sourceQuery = `SELECT * FROM ${fqn}`;
  const baseAttrs: Partial<DataAdapterQueries> = {
    sourceQuery,
    getSortableReader: getGetSortableReaderApiFromFQN(pool, fqn),
    getColumnAggregate: getGetColumnAggregateFromFQN(pool, fqn),
    getColumnsData: getGetColumnsDataApiFromFQN(pool, fqn),
    getChartAggregatedData: getGetChartAggregatedDataFromFQN(pool, fqn),
  };

  if (dataSource.type === 'parquet' && sourceFile) {
    return {
      ...baseAttrs,
      getRowCount: async (abortSignal: AbortSignal) => {
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

  // All other flat file types (csv, json, xlsx-sheet, readstat formats)
  return {
    ...baseAttrs,
    getRowCount: async (abortSignal: AbortSignal) => {
      const { value, aborted } = await pool.queryAbortable(
        `SELECT count(*) FROM ${toDuckDBIdentifier(dataSource.viewName)}`,
        abortSignal,
      );

      if (aborted) {
        return { value: 0, aborted };
      }
      return { value: Number(value.getChildAt(0)?.get(0)), aborted };
    },
  };
}

// Generic function that works for both LocalDB and RemoteDB since they share the same interface
// for database operations (both have dbName and dbType fields)
function getDatabaseDataAdapterApi(
  pool: AsyncDuckDBConnectionPool,
  dataSource: LocalDB | RemoteDB | IcebergCatalog,
  tab: TabReactiveState<LocalDBDataTab>,
): { adapter: DataAdapterQueries | null; userErrors: string[]; internalErrors: string[] } {
  const rawDbName = getDatabaseIdentifier(dataSource);
  const dbName = toDuckDBIdentifier(rawDbName);
  const schemaName = toDuckDBIdentifier(tab.schemaName);
  const tableName = toDuckDBIdentifier(tab.objectName);
  const fqn = `${dbName}.${schemaName}.${tableName}`;

  return {
    adapter: {
      sourceQuery: `SELECT * FROM ${fqn}`,
      getEstimatedRowCount:
        'dbType' in dataSource && dataSource.dbType === 'duckdb'
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
      getChartAggregatedData: getGetChartAggregatedDataFromFQN(pool, fqn),
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

  if (isFlatFileDataSource(dataSource)) {
    if (tab.dataSourceType !== 'file') {
      return {
        adapter: null,
        userErrors: [],
        internalErrors: [
          `Tried creating a flat file data adapter from a tab with different source type: ${tab.dataSourceType}`,
        ],
      };
    }

    if (!sourceFile && dataSource.type !== 'gsheet-sheet') {
      return {
        adapter: null,
        userErrors: [],
        internalErrors: ['Source file is missing for the flat file data source'],
      };
    }

    if (sourceFile && sourceFile.kind !== 'file') {
      return {
        adapter: null,
        userErrors: [],
        internalErrors: [
          `Tried creating a flat file data adapter from a directory: ${sourceFile.id}`,
        ],
      };
    }

    return {
      adapter: getFlatFileDataAdapterQueries(
        pool,
        dataSource,
        sourceFile && sourceFile.kind === 'file' ? sourceFile : undefined,
      ),
      userErrors: [],
      internalErrors: [],
    };
  }

  if (dataSource.type === 'iceberg-catalog') {
    if (tab.dataSourceType !== 'db') {
      return {
        adapter: null,
        userErrors: [],
        internalErrors: [
          `Tried creating an iceberg catalog data adapter from a tab with different source type: ${tab.dataSourceType}`,
        ],
      };
    }

    // Check connection state
    if (dataSource.connectionState !== 'connected') {
      return {
        adapter: null,
        userErrors: [`Iceberg catalog '${dataSource.catalogAlias}' is not connected`],
        internalErrors: [],
      };
    }

    // Iceberg catalogs use the same logic as other databases
    return getDatabaseDataAdapterApi(pool, dataSource, tab);
  }

  const _exhaustiveCheck: never = dataSource;
  return {
    adapter: null,
    userErrors: [],
    internalErrors: [`Unexpected unsupported data source type: ${_exhaustiveCheck}`],
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
      sourceQuery: classifiedStmt.isAllowedInSubquery ? trimmedQuery : undefined,
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
      getChartAggregatedData: classifiedStmt.isAllowedInSubquery
        ? async (
            xColumn: string,
            yColumn: string,
            aggregation: ChartAggregationType,
            groupByColumn: string | null,
            sortBy: 'x' | 'y',
            sortOrder: ChartSortOrder | null,
            abortSignal: AbortSignal,
          ) => {
            const query = buildChartAggregationQuery(
              `(${trimmedQuery})`,
              xColumn,
              yColumn,
              aggregation,
              groupByColumn,
              sortBy,
              sortOrder,
            );

            const { value, aborted } = await pool.queryAbortable(query, abortSignal);

            if (aborted) {
              return { value: [], aborted };
            }

            return { value: convertArrowToChartData(value, groupByColumn !== null), aborted };
          }
        : undefined,
    },
    userErrors: [],
    internalErrors: [],
  };
}
