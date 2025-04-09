import * as duckdb from '@duckdb/duckdb-wasm';
import { tableToIPC } from 'apache-arrow';

import { Dataset } from '@models/common';
import { createName } from '../../utils/helpers';
import {
  DBRunQueryProps,
  DbAPIType,
  DropFilesAndDBInstancesProps,
  RunQueryResponse,
} from './models';
import { GET_DBS_SQL_QUERY, GET_VIEWS_SQL_QUERY } from './consts';

/**
 * Retrieves the total number of rows for pagination by executing a count query.
 *
 * @param {AsyncDuckDBConnection} conn - The DuckDB connection instance.
 * @param {string} query - The SQL query to count rows from.
 * @returns {Promise<number>} The total number of rows.
 */
export const getPaginationRowsCount = async (
  conn: duckdb.AsyncDuckDBConnection,
  query: string,
): Promise<number> => {
  const pagination = await conn.query(`SELECT COUNT(*) FROM (${query});`);

  const totalRowsCount = pagination?.toArray().map((row) => {
    const count = Object.values(row.toJSON())[0];
    if (typeof count === 'bigint') {
      return Number(count.toString());
    }
    if (typeof count === 'number') {
      return count;
    }
    return 0;
  }) || [0];

  return totalRowsCount[0] as number;
};

/**
 * Get app-defined instances
 */
async function getDBUserInstances(conn: duckdb.AsyncDuckDBConnection, type: 'databases' | 'views') {
  const viewsResult = await conn.query(
    type === 'databases' ? GET_DBS_SQL_QUERY : GET_VIEWS_SQL_QUERY,
  );

  return tableToIPC(viewsResult);
}

const buildColumnsQueryWithFilters = (database_name?: string, schema_name?: string): string => {
  let whereClause = '';
  if (database_name || schema_name) {
    const conditions = [];
    if (database_name) conditions.push(`database_name = '${database_name}'`);
    if (schema_name) conditions.push(`schema_name = '${schema_name}'`);
    whereClause = `WHERE ${conditions.join(' AND ')}`;
  }

  return `
    SELECT
      database_name,
      schema_name,
      table_name,
      column_name,
      column_index,
      data_type,
      is_nullable
    FROM duckdb_columns()
    ${whereClause}
    ORDER BY database_name, schema_name, table_name, column_index;
  `;
};

/**
 * Get all tables and their columns
 *
 * @param database_name - Optional database name to filter by
 * @param schema_name - Optional schema name to filter by
 * @returns Table and column information in Arrow IPC format
 */
async function getTablesAndColumns(
  conn: duckdb.AsyncDuckDBConnection,
  database_name?: string,
  schema_name?: string,
) {
  const query = buildColumnsQueryWithFilters(database_name, schema_name);
  const columnsResult = await conn.query(query);
  return tableToIPC(columnsResult);
}

/**
 * Register file handle
 *
 * @param fileName - Name of the file
 * @param handle - File handle
 */
async function registerFileHandleAndCreateDBInstance(
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
  dataset: Dataset,
) {
  const fileName = dataset.handle.name;
  const { handle } = dataset;
  const formatSupported = ['.csv', '.parquet', '.duckdb', '.json', '.xlsx'].some((ext) =>
    fileName.endsWith(ext),
  );

  if (!formatSupported) throw new Error('Unsupported file format');

  const file = await handle.getFile();

  /**
   * Drop file if it already exists
   */
  await db.dropFile(fileName).catch(console.error);

  /**
   * Register file handle
   */
  await db.registerFileHandle(fileName, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);

  /**
   * Create instance
   */
  if (fileName.endsWith('.duckdb')) {
    await conn.query(`ATTACH '${fileName}' AS ${createName(fileName)} (READ_ONLY); `);
  } else {
    const viewName = createName(fileName);

    await conn.query(`CREATE or REPLACE VIEW ${viewName} AS SELECT * FROM "${fileName}";`);
    const id = JSON.stringify({ sourceId: dataset.id });
    await conn.query(`COMMENT ON VIEW ${viewName} IS '${id}';`);
  }
}

/**
 * Drop file and view
 */
async function dropFilesAndDBInstances({
  ids,
  type,
  conn,
}: DropFilesAndDBInstancesProps & { conn: duckdb.AsyncDuckDBConnection }) {
  if (type === 'databases') {
    const databases = await conn.query('SELECT * FROM duckdb_databases');
    const databasesToDelete = databases.toArray().filter((row) => {
      const id = JSON.parse(row.comment || '{}').sourceId;
      return ids.includes(id);
    });
    await Promise.all(
      databasesToDelete.map(async (row) => {
        await conn.query(`DETACH ${row.name};`);
      }),
    );
  }

  if (type === 'views') {
    const views = await conn.query('SELECT * FROM duckdb_views');
    const viewsToDelete = views
      .toArray()
      .filter((row) => {
        const id = JSON.parse(row.comment || '{}').sourceId;
        return ids.includes(id);
      })
      .map((row) => row.toJSON());

    await Promise.all(
      viewsToDelete.map(async (row) => {
        await conn.query(`DROP VIEW ${row.view_name};`);
      }),
    );
  }
}

/**
 * Run paginated query
 */
async function runQuery({
  query,
  hasLimit,
  queryWithoutLimit,
  conn,
}: DBRunQueryProps & { conn: duckdb.AsyncDuckDBConnection }): Promise<
  Omit<RunQueryResponse, 'originalQuery'>
> {
  try {
    /**
     * Run query
     */
    const result = await conn.query(query);

    /**
     * Get total rows count for pagination
     */
    const totalRowsCount = hasLimit
      ? await getPaginationRowsCount(conn, queryWithoutLimit || query)
      : 0;

    /**
     * Return data and pagination
     */
    return {
      data: result,
      pagination: totalRowsCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(message);
  } finally {
    conn.cancelSent();
  }
}

export const dbApiProxi: DbAPIType = {
  runQuery,
  registerFileHandleAndCreateDBInstance,
  dropFilesAndDBInstances,
  getDBUserInstances,
  getTablesAndColumns,
};
