import * as duckdb from '@duckdb/duckdb-wasm';

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
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
  handle: FileSystemFileHandle,
  fileName: string,
  viewName: string,
) {
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
   * Create view
   */
  await conn.query(`CREATE OR REPLACE VIEW ${viewName} AS SELECT * FROM '${fileName}';`);
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
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
  handle: FileSystemFileHandle,
  fileName: string,
  dbName: string,
) {
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
   * Detach any existing database with the same name
   */
  await conn.query(`DETACH DATABASE IF EXISTS ${dbName};`).catch(console.error);

  /**
   * Create view
   */
  await conn.query(`CREATE OR REPLACE VIEW ${dbName} AS SELECT * FROM "${fileName}";`);
}
