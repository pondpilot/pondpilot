import * as duckdb from '@duckdb/duckdb-wasm';
import { tableToIPC } from 'apache-arrow';
import { expose } from 'comlink';
import { GET_DBS_SQL_QUERY, GET_VIEWS_SQL_QUERY } from './consts';
import { DBRunQueryProps, DBWorkerAPIType, RunQueryResponse } from './models';
import { buildColumnsQueryWithFilters, getCreateViewQuery } from './utils';
import { createName } from '../../utils/helpers';

let db: duckdb.AsyncDuckDB | null = null;

/**
 * Database initialization
 */
async function initDB() {
  try {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

    const worker_url = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }),
    );

    const logger = new duckdb.ConsoleLogger();
    const worker = new Worker(worker_url);
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    await db.open({
      query: {
        // Enable Apache Arrow type and value patching DECIMAL -> DOUBLE on query materialization
        // https://github.com/apache/arrow/issues/37920
        castDecimalToDouble: true,
      },
    });

    // Load parquet extension
    // await loadExtension(db, 'parquet');
  } catch (error) {
    console.error('Failed to initialize DuckDB:', error);
    throw error;
  }
}

/**
 * Retrieves the total number of rows for pagination by executing a count query.
 *
 * @param {AsyncDuckDBConnection} connection - The DuckDB connection instance.
 * @param {string} query - The SQL query to count rows from.
 * @returns {Promise<number>} The total number of rows.
 */
export const getPaginationRowsCount = async (
  connection: duckdb.AsyncDuckDBConnection,
  query: string,
): Promise<number> => {
  const pagination = await connection.query(`SELECT COUNT(*) FROM (${query});`);

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
async function getDBUserInstances(type: 'databases' | 'views') {
  const conn = await db?.connect();
  if (!conn) throw new Error('Connection not initialized');

  const viewsResult = await conn.query(
    type === 'databases' ? GET_DBS_SQL_QUERY : GET_VIEWS_SQL_QUERY,
  );

  await conn.close();

  return tableToIPC(viewsResult);
}

/**
 * Get all tables and their columns
 *
 * @param database_name - Optional database name to filter by
 * @param schema_name - Optional schema name to filter by
 * @returns Table and column information in Arrow IPC format
 */
async function getTablesAndColumns(database_name?: string, schema_name?: string) {
  const conn = await db?.connect();
  if (!conn) throw new Error('Connection not initialized');
  try {
    const query = buildColumnsQueryWithFilters(database_name, schema_name);
    const columnsResult = await conn.query(query);
    return tableToIPC(columnsResult);
  } finally {
    await conn.close();
  }
}

/**
 * Register file handle
 *
 * @param fileName - Name of the file
 * @param handle - File handle
 */
async function registerFileHandleAndCreateDBInstance(
  fileName: string,
  handle: FileSystemFileHandle,
) {
  const conn = await db?.connect();
  const formatSupported = ['.csv', '.parquet', '.duckdb', '.json', '.xlsx'].some((ext) =>
    fileName.endsWith(ext),
  );

  if (!db || !conn) throw new Error('Database not initialized');
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
    await conn.query(getCreateViewQuery(fileName));
  }

  await conn.close();
}

/**
 * Drop file and view
 */
async function dropFilesAndDBInstances(paths: string[], type: 'database' | 'view') {
  const conn = await db?.connect();
  if (!conn) throw new Error('Connection not initialized');

  await Promise.all(
    paths.map(async (path) => {
      await db?.dropFile(path);
      if (type === 'database') {
        await conn.query(`DETACH ${path}; `);
      }
      if (type === 'view') {
        await conn.query(`DROP VIEW ${path}; `);
      }
    }),
  );

  await conn.close();
}

/**
 * Run paginated query
 */
async function runQuery({
  query,
  hasLimit,
  queryWithoutLimit,
}: DBRunQueryProps): Promise<RunQueryResponse> {
  const conn = await db?.connect();

  if (!conn) throw new Error('Connection not initialized');

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
      data: tableToIPC(result),
      pagination: totalRowsCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(message);
  } finally {
    conn.cancelSent();
    conn.close();
  }
}

const DBWorkerAPI: DBWorkerAPIType = {
  initDB,
  runQuery,
  registerFileHandleAndCreateDBInstance,
  dropFilesAndDBInstances,
  getDBUserInstances,
  getTablesAndColumns,
};

expose(DBWorkerAPI);
