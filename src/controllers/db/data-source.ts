import * as duckdb from '@duckdb/duckdb-wasm';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { supportedFlatFileDataSourceFileExt } from '@models/file-system';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { quote } from '@utils/helpers';
import { createXlsxSheetViewQuery } from '@utils/xlsx';

/**
 * Register regular data source file (not a databse) and create a view
 *
 * TODO: error handling - currently assumes this never fails
 *
 * @param db - DuckDB instance
 * @param conn - DuckDB connection
 * @param handle - File handle pointing to a supported source file
 * @param fileName - A valid, unique file name to register.
 *                   Does not need to match the real file name, but should
 *                      not conflict with any other registered file.
 * @param viewName - A valid, unique identifier of the view to create.
 *                   This function will overwrite any existing view with the same name.
 */
export async function registerFileSourceAndCreateView(
  conn: AsyncDuckDBConnectionPool,
  handle: FileSystemFileHandle,
  fileExt: supportedFlatFileDataSourceFileExt,
  fileName: string,
  viewName: string,
) {
  const file = await handle.getFile();
  const db = conn.bindings;

  /**
   * Drop file if it already exists
   */
  await db.dropFile(fileName).catch(console.error);

  /**
   * Register file handle
   */
  await db.registerFileHandle(fileName, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);

  /**
   * Create view
   */

  if (fileExt === 'csv') {
    await conn.query(
      `CREATE OR REPLACE VIEW ${toDuckDBIdentifier(viewName)} AS SELECT * FROM read_csv(${quote(fileName, { single: true })}, strict_mode=false);`,
    );
    return;
  }

  await conn.query(
    `CREATE OR REPLACE VIEW ${toDuckDBIdentifier(viewName)} AS SELECT * FROM ${quote(fileName, { single: true })};`,
  );
}

/**
 * Drop a view and unregister its file handle
 *
 * TODO: error handling - currently assumes this never fails
 *
 * @param db - DuckDB instance
 * @param conn - DuckDB connection
 * @param viewName - The view name that was created
 * @param fileName - The file name that was used to register the file, undefined if not available
 */
export async function dropViewAndUnregisterFile(
  conn: AsyncDuckDBConnectionPool,
  viewName: string,
  fileName: string | undefined,
) {
  /**
   * Drop the view
   */
  await conn.query(`DROP VIEW IF EXISTS ${toDuckDBIdentifier(viewName)};`).catch(console.error);

  if (!fileName) {
    return;
  }

  const db = conn.bindings;

  /**
   * Unregister file handle
   */
  await db.dropFile(fileName).catch(console.error);
}

/**
 * Register a database file and attach it to the DuckDB instance
 *
 * TODO: error handling - currently assumes this never fails
 *
 * @param db - DuckDB instance
 * @param conn - DuckDB connection
 * @param handle - File handle pointing to a supported source file
 * @param fileName - A valid, unique file name to register.
 *                   Does not need to match the real file name, but should
 *                   not conflict with any other registered file.
 * @param dbName - A valid, unique identifier to attach the database as.
 *                   This function will overwrite any existing database with the same name.
 */
export async function registerAndAttachDatabase(
  conn: AsyncDuckDBConnectionPool,
  handle: FileSystemFileHandle,
  fileName: string,
  dbName: string,
) {
  const file = await handle.getFile();
  const db = conn.bindings;

  /**
   * Drop file if it already exists
   */
  await db.dropFile(fileName).catch(console.error);

  /**
   * Register file handle
   */
  await db.registerFileHandle(fileName, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);

  /**
   * Detach any existing database with the same name
   */
  await conn.query(`DETACH DATABASE IF EXISTS ${toDuckDBIdentifier(dbName)};`).catch(console.error);

  /**
   * Attach the database
   */
  await conn.query(
    `ATTACH ${quote(fileName, { single: true })} as ${toDuckDBIdentifier(dbName)} (READ_ONLY);`,
  );
}

/**
 * Detach a database and unregister its file handle
 *
 * TODO: error handling - currently assumes this never fails
 *
 * @param db - DuckDB instance
 * @param conn - DuckDB connection
 * @param dbName - The database name that was used when attaching
 * @param fileName - The file name that was used to register the database
 */
export async function detachAndUnregisterDatabase(
  conn: AsyncDuckDBConnectionPool,
  dbName: string,
  fileName: string | undefined,
) {
  /**
   * Detach the database
   */
  await conn.query(`DETACH DATABASE IF EXISTS ${toDuckDBIdentifier(dbName)};`).catch(console.error);

  if (!fileName) {
    return;
  }

  const db = conn.bindings;

  /**
   * Unregister file handle
   */
  await db.dropFile(fileName).catch(console.error);
}

/**
 * Register a file handle with DuckDB
 *
 * @param conn - DuckDB connection pool
 * @param handle - File handle to register
 * @param fileName - A valid, unique name to register the file as
 * @returns The registered file
 */
export async function registerFileHandle(
  conn: AsyncDuckDBConnectionPool,
  handle: FileSystemFileHandle,
  fileName: string,
): Promise<File> {
  const file = await handle.getFile();
  const db = conn.bindings;

  // Drop file if it already exists
  await db.dropFile(fileName).catch(console.error);

  // Register the file handle with DuckDB
  await db.registerFileHandle(fileName, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);

  return file;
}

/**
 * Create a view for a specific sheet
 *
 * @param conn - DuckDB connection pool
 * @param fileName - A valid, unique name to register the file as
 * @param sheetName - The name of the sheet to create a view for
 * @param viewName - A valid, unique identifier of the view to create.
 */
export async function createXlsxSheetView(
  conn: AsyncDuckDBConnectionPool,
  fileName: string,
  sheetName: string,
  viewName: string,
) {
  // Load the Excel extension, it will be ignored if already loaded
  await conn.query('LOAD excel');

  // Create the view for the specified sheet
  const query = createXlsxSheetViewQuery(fileName, sheetName, toDuckDBIdentifier(viewName));
  await conn.query(query);
}
