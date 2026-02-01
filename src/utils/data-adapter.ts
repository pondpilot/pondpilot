import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import {
  ChartAggregatedData,
  ChartAggregationType,
  ChartSortOrder,
  ColumnAggregateType,
  ColumnDistribution,
  ColumnStats,
  DataAdapterQueries,
  MetadataColumnType,
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

/**
 * Maximum number of top values to return for text column distributions.
 */
const MAX_TOP_VALUES = 20;

/**
 * Number of histogram buckets for numeric/date column distributions.
 */
const NUM_HISTOGRAM_BUCKETS = 20;

/**
 * Builds a SQL query that computes summary statistics for multiple columns in a single pass.
 * Returns one row per column with: column_name, total_count, distinct_count, null_count, min_value, max_value, mean_value.
 */
export function buildColumnStatsQuery(source: string, columnNames: string[]): string {
  const perColumn = columnNames.map((name) => {
    const col = toDuckDBIdentifier(name);
    const nameStr = `'${name.replace(/'/g, "''")}'`;

    return `SELECT
      ${nameStr} AS column_name,
      COUNT(*) AS total_count,
      COUNT(DISTINCT ${col}) AS distinct_count,
      COUNT(*) - COUNT(${col}) AS null_count,
      CAST(MIN(${col}) AS VARCHAR) AS min_value,
      CAST(MAX(${col}) AS VARCHAR) AS max_value,
      CAST(AVG(TRY_CAST(${col} AS DOUBLE)) AS VARCHAR) AS mean_value
    FROM ${source}`;
  });

  return perColumn.join('\nUNION ALL\n');
}

/**
 * Builds a SQL query for numeric column distribution using equi-width buckets.
 */
export function buildNumericDistributionQuery(source: string, columnName: string): string {
  const col = toDuckDBIdentifier(columnName);

  return `WITH stats AS (
  SELECT MIN(${col}) AS min_val, MAX(${col}) AS max_val FROM ${source} WHERE ${col} IS NOT NULL
),
buckets AS (
  SELECT
    CASE
      WHEN stats.max_val = stats.min_val THEN 0
      ELSE LEAST(
        FLOOR((${col} - stats.min_val) / ((stats.max_val - stats.min_val) / ${NUM_HISTOGRAM_BUCKETS}.0)),
        ${NUM_HISTOGRAM_BUCKETS} - 1
      )
    END AS bucket,
    stats.min_val,
    stats.max_val
  FROM ${source}, stats
  WHERE ${col} IS NOT NULL
)
SELECT
  CAST(min_val + bucket * ((max_val - min_val) / ${NUM_HISTOGRAM_BUCKETS}.0) AS VARCHAR)
    || ' - '
    || CAST(min_val + (bucket + 1) * ((max_val - min_val) / ${NUM_HISTOGRAM_BUCKETS}.0) AS VARCHAR) AS label,
  COUNT(*) AS count
FROM buckets
GROUP BY bucket, min_val, max_val
ORDER BY bucket`;
}

/**
 * Builds a SQL query for text column distribution (top N values by frequency).
 */
export function buildTextDistributionQuery(source: string, columnName: string): string {
  const col = toDuckDBIdentifier(columnName);

  return `SELECT
  CAST(${col} AS VARCHAR) AS value,
  COUNT(*) AS count
FROM ${source}
WHERE ${col} IS NOT NULL
GROUP BY ${col}
ORDER BY count DESC
LIMIT ${MAX_TOP_VALUES}`;
}

/**
 * Builds a SQL query for date/timestamp column distribution using auto time buckets.
 */
export function buildDateDistributionQuery(source: string, columnName: string): string {
  const col = toDuckDBIdentifier(columnName);

  return `WITH date_range AS (
  SELECT
    MIN(${col}) AS min_date,
    MAX(${col}) AS max_date,
    DATEDIFF('day', MIN(${col}), MAX(${col})) AS day_span
  FROM ${source}
  WHERE ${col} IS NOT NULL
),
bucket_interval AS (
  SELECT
    CASE
      WHEN day_span <= 31 THEN 'day'
      WHEN day_span <= 365 THEN 'month'
      ELSE 'year'
    END AS interval_type
  FROM date_range
)
SELECT
  CAST(DATE_TRUNC(bi.interval_type, ${col}) AS VARCHAR) AS label,
  COUNT(*) AS count
FROM ${source}, bucket_interval bi
WHERE ${col} IS NOT NULL
GROUP BY DATE_TRUNC(bi.interval_type, ${col})
ORDER BY DATE_TRUNC(bi.interval_type, ${col})`;
}

/**
 * Parses column stats from an Arrow table result.
 */
function convertArrowToColumnStats(arrowTable: any): ColumnStats[] {
  const result: ColumnStats[] = [];
  const { numRows } = arrowTable;

  for (let i = 0; i < numRows; i += 1) {
    const columnName = arrowTable.getChildAt(0)?.get(i);
    const totalCount = arrowTable.getChildAt(1)?.get(i);
    const distinctCount = arrowTable.getChildAt(2)?.get(i);
    const nullCount = arrowTable.getChildAt(3)?.get(i);
    const minValue = arrowTable.getChildAt(4)?.get(i);
    const maxValue = arrowTable.getChildAt(5)?.get(i);
    const meanValue = arrowTable.getChildAt(6)?.get(i);

    result.push({
      columnName: String(columnName),
      totalCount: Number(totalCount),
      distinctCount: Number(distinctCount),
      nullCount: Number(nullCount),
      min: minValue != null ? String(minValue) : null,
      max: maxValue != null ? String(maxValue) : null,
      mean: meanValue != null ? String(meanValue) : null,
    });
  }

  return result;
}

/**
 * Parses distribution data from an Arrow table result.
 */
function convertArrowToDistribution(
  arrowTable: any,
  columnType: MetadataColumnType,
): ColumnDistribution {
  const { numRows } = arrowTable;

  if (columnType === 'text') {
    const values: ColumnDistribution & { type: 'text' } = { type: 'text', values: [] };
    for (let i = 0; i < numRows; i += 1) {
      const value = arrowTable.getChildAt(0)?.get(i);
      const count = arrowTable.getChildAt(1)?.get(i);
      if (value != null) {
        values.values.push({ value: String(value), count: Number(count) });
      }
    }
    return values;
  }

  const buckets: ColumnDistribution & { type: 'numeric' | 'date' } = {
    type: columnType,
    buckets: [],
  };
  for (let i = 0; i < numRows; i += 1) {
    const label = arrowTable.getChildAt(0)?.get(i);
    const count = arrowTable.getChildAt(1)?.get(i);
    if (label != null) {
      buckets.buckets.push({ label: String(label), count: Number(count) });
    }
  }
  return buckets;
}

function getGetColumnStatsFromFQN(
  pool: AsyncDuckDBConnectionPool,
  fqn: string,
): DataAdapterQueries['getColumnStats'] {
  return async (columnNames: string[], abortSignal: AbortSignal) => {
    if (columnNames.length === 0) {
      return { value: [], aborted: false };
    }
    const query = buildColumnStatsQuery(fqn, columnNames);
    const { value, aborted } = await pool.queryAbortable(query, abortSignal);

    if (aborted) {
      return { value: [], aborted };
    }
    return { value: convertArrowToColumnStats(value), aborted };
  };
}

function getGetColumnDistributionFromFQN(
  pool: AsyncDuckDBConnectionPool,
  fqn: string,
): DataAdapterQueries['getColumnDistribution'] {
  return async (
    columnName: string,
    columnType: MetadataColumnType,
    abortSignal: AbortSignal,
  ) => {
    let query: string;

    switch (columnType) {
      case 'numeric':
        query = buildNumericDistributionQuery(fqn, columnName);
        break;
      case 'date':
        query = buildDateDistributionQuery(fqn, columnName);
        break;
      case 'text':
        query = buildTextDistributionQuery(fqn, columnName);
        break;
    }

    const { value, aborted } = await pool.queryAbortable(query, abortSignal);

    if (aborted) {
      return {
        value: columnType === 'text' ? { type: 'text' as const, values: [] } : { type: columnType, buckets: [] },
        aborted,
      };
    }

    return { value: convertArrowToDistribution(value, columnType), aborted };
  };
}

function getFlatFileDataAdapterQueries(
  pool: AsyncDuckDBConnectionPool,
  dataSource: AnyFlatFileDataSource,
  sourceFile: LocalFile,
): DataAdapterQueries {
  const fqn = `main.${toDuckDBIdentifier(dataSource.viewName)}`;

  const sourceQuery = `SELECT * FROM ${fqn}`;
  const baseAttrs: Partial<DataAdapterQueries> = {
    sourceQuery,
    getSortableReader: getGetSortableReaderApiFromFQN(pool, fqn),
    getColumnAggregate: getGetColumnAggregateFromFQN(pool, fqn),
    getColumnsData: getGetColumnsDataApiFromFQN(pool, fqn),
    getChartAggregatedData: getGetChartAggregatedDataFromFQN(pool, fqn),
    getColumnStats: getGetColumnStatsFromFQN(pool, fqn),
    getColumnDistribution: getGetColumnDistributionFromFQN(pool, fqn),
  };

  if (dataSource.type === 'parquet') {
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
      getColumnStats: getGetColumnStatsFromFQN(pool, fqn),
      getColumnDistribution: getGetColumnDistributionFromFQN(pool, fqn),
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
      getColumnStats: classifiedStmt.isAllowedInSubquery
        ? async (columnNames: string[], abortSignal: AbortSignal) => {
            if (columnNames.length === 0) {
              return { value: [], aborted: false };
            }
            const query = buildColumnStatsQuery(`(${trimmedQuery})`, columnNames);
            const { value, aborted } = await pool.queryAbortable(query, abortSignal);

            if (aborted) {
              return { value: [], aborted };
            }
            return { value: convertArrowToColumnStats(value), aborted };
          }
        : undefined,
      getColumnDistribution: classifiedStmt.isAllowedInSubquery
        ? async (
            columnName: string,
            columnType: MetadataColumnType,
            abortSignal: AbortSignal,
          ) => {
            let query: string;
            switch (columnType) {
              case 'numeric':
                query = buildNumericDistributionQuery(`(${trimmedQuery})`, columnName);
                break;
              case 'date':
                query = buildDateDistributionQuery(`(${trimmedQuery})`, columnName);
                break;
              case 'text':
                query = buildTextDistributionQuery(`(${trimmedQuery})`, columnName);
                break;
            }
            const { value, aborted } = await pool.queryAbortable(query, abortSignal);

            if (aborted) {
              return {
                value: columnType === 'text'
                  ? { type: 'text' as const, values: [] }
                  : { type: columnType, buckets: [] },
                aborted,
              };
            }
            return { value: convertArrowToDistribution(value, columnType), aborted };
          }
        : undefined,
    },
    userErrors: [],
    internalErrors: [],
  };
}
