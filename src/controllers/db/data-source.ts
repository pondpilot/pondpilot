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
 * @param conn - DuckDB connection
 * @param handle - File handle pointing to a supported source file
 * @param fileExt - The file extension of the file
 * @param fileName - A valid, unique file name to register.
 *                   Does not need to match the real file name, but should
 *                      not conflict with any other registered file.
 * @param viewName - A valid, unique identifier of the view to create.
 *                   This function will overwrite any existing view with the same name.
 * * @returns The registered file
 */
export async function registerFileSourceAndCreateView(
  conn: AsyncDuckDBConnectionPool,
  handle: FileSystemFileHandle,
  fileExt: supportedFlatFileDataSourceFileExt,
  fileName: string,
  viewName: string,
): Promise<File> {
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
    return file;
  }

  await conn.query(
    `CREATE OR REPLACE VIEW ${toDuckDBIdentifier(viewName)} AS SELECT * FROM ${quote(fileName, { single: true })};`,
  );
  return file;
}

/**
 * Drop a view and unregister its file handle
 *
 * TODO: error handling - currently assumes this never fails
 *
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
 * Recreate a view with a new name
 *
 * TODO: error handling - currently assumes this never fails
 *
 * @param conn - DuckDB connection
 * @param fileExt - The file extension of the file
 * @param fileName - A valid, unique file name to register.
 *                   Does not need to match the real file name, but should
 *                      not conflict with any other registered file.
 * @param oldViewName - The name of the view to drop.
 * @param newViewName - A valid, unique identifier of the view to create.
 *                      This function will overwrite any existing view with the same name.
 */
export async function reCreateView(
  conn: AsyncDuckDBConnectionPool,
  fileExt: supportedFlatFileDataSourceFileExt,
  fileName: string,
  oldViewName: string,
  newViewName: string,
): Promise<void> {
  /**
   * Drop the old view
   */
  await conn.query(`DROP VIEW IF EXISTS ${toDuckDBIdentifier(oldViewName)};`).catch(console.error);

  /**
   * Create view with the new name
   */

  if (fileExt === 'csv') {
    await conn.query(
      `CREATE OR REPLACE VIEW ${toDuckDBIdentifier(newViewName)} AS SELECT * FROM read_csv(${quote(fileName, { single: true })}, strict_mode=false);`,
    );
  }

  await conn.query(
    `CREATE OR REPLACE VIEW ${toDuckDBIdentifier(newViewName)} AS SELECT * FROM ${quote(fileName, { single: true })};`,
  );
}

/**
 * Register a database file and attach it to the DuckDB instance
 *
 * TODO: error handling - currently assumes this never fails
 *
 * @param conn - DuckDB connection
 * @param handle - File handle pointing to a supported source file
 * @param fileName - A valid, unique file name to register.
 *                   Does not need to match the real file name, but should
 *                   not conflict with any other registered file.
 * @param dbName - A valid, unique identifier to attach the database as.
 *                   This function will overwrite any existing database with the same name.
 * @returns The registered file
 */
export async function registerAndAttachDatabase(
  conn: AsyncDuckDBConnectionPool,
  handle: FileSystemFileHandle,
  fileName: string,
  dbName: string,
): Promise<File> {
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

  return file;
}

/**
 * Detach a database and unregister its file handle
 *
 * TODO: error handling - currently assumes this never fails
 *
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
 * Detach old database and register a new one
 *
 * TODO: error handling - currently assumes this never fails
 *
 * @param conn - DuckDB connection
 * @param fileName - A valid, unique file name to register.
 *                   Does not need to match the real file name, but should
 *                   not conflict with any other registered file.
 * @param oldDbName - The name of the database to detach.
 * @param newDbName - A valid, unique identifier to attach the database as.
 *                    This function will overwrite any existing database with the same name.
 */
export async function reAttachDatabase(
  conn: AsyncDuckDBConnectionPool,
  fileName: string,
  oldDbName: string,
  newDbName: string,
): Promise<void> {
  /**
   * Detach the old database
   */
  await conn
    .query(`DETACH DATABASE IF EXISTS ${toDuckDBIdentifier(oldDbName)};`)
    .catch(console.error);

  /**
   * Detach any existing database with the new name
   */
  await conn
    .query(`DETACH DATABASE IF EXISTS ${toDuckDBIdentifier(newDbName)};`)
    .catch(console.error);

  /**
   * Attach the database with the new name
   */
  await conn.query(
    `ATTACH ${quote(fileName, { single: true })} as ${toDuckDBIdentifier(newDbName)} (READ_ONLY);`,
  );
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
 * Drop a file
 *
 * @param conn - DuckDB connection pool
 * @param fileName - The name of the file to drop
 */
export async function dropFile(conn: AsyncDuckDBConnectionPool, fileName: string): Promise<void> {
  const db = conn.bindings;

  // Drop file if it already exists
  await db.dropFile(fileName).catch(console.error);
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
  const query = createXlsxSheetViewQuery(fileName, sheetName, viewName);
  await conn.query(query);
}

/**
 * Drop the old view and create a new one with a specified name
 *
 * @param conn - DuckDB connection pool
 * @param fileName - A valid, unique name to register the file as
 * @param sheetName - The name of the sheet to create a view for
 * @param oldViewName - The name of the view to drop.
 * @param newViewName - A valid, unique identifier of the view to create.
 */
export async function reCreateXlsxSheetView(
  conn: AsyncDuckDBConnectionPool,
  fileName: string,
  sheetName: string,
  oldViewName: string,
  newViewName: string,
) {
  /**
   * Drop the old view
   */
  await conn.query(`DROP VIEW IF EXISTS ${toDuckDBIdentifier(oldViewName)};`).catch(console.error);

  // Create the view with the new name
  const query = createXlsxSheetViewQuery(fileName, sheetName, newViewName);
  await conn.query(query);
}
