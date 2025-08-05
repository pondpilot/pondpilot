import { DuckDBDataProtocol } from '@duckdb/duckdb-wasm';
import { ConnectionPool } from '@engines/types';
import { CSV_MAX_LINE_SIZE } from '@models/db';
import { supportedFlatFileDataSourceFileExt } from '@models/file-system';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { quote } from '@utils/helpers';
import { buildAttachQuery, buildDetachQuery, buildDropViewQuery } from '@utils/sql-builder';
import { createXlsxSheetViewQuery } from '@utils/xlsx';

import { getFileReference, getFileContent, needsFileRegistration } from './file-access';

/**
 * Helper function to create a view for CSV files with proper configuration
 * @param conn - DuckDB connection
 * @param viewName - Name of the view to create
 * @param fileName - Name of the CSV file
 */
async function createCSVView(
  conn: ConnectionPool,
  viewName: string,
  fileName: string,
): Promise<void> {
  await conn.query(
    `CREATE OR REPLACE VIEW ${toDuckDBIdentifier(viewName)} AS SELECT * FROM read_csv(${quote(fileName, { single: true })}, strict_mode=false, max_line_size=${CSV_MAX_LINE_SIZE});`,
  );
}

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
  conn: ConnectionPool,
  handle: FileSystemFileHandle | null,
  fileExt: supportedFlatFileDataSourceFileExt,
  fileName: string,
  viewName: string,
): Promise<File | null> {
  console.log('[registerFileSourceAndCreateView] Called with:', {
    handle: handle ? 'Present' : 'Null',
    fileExt,
    fileName,
    viewName,
    needsFileRegistration: needsFileRegistration(),
  });

  // Get file reference (path for Tauri, filename for web)
  const fileRef = getFileReference(handle, fileName);
  console.log('[registerFileSourceAndCreateView] File reference:', fileRef);

  // Register file if needed (web only)
  let file: File | null = null;
  if (needsFileRegistration()) {
    // In web, we need to use the same fileName that was passed in, not fileRef.path
    file = await registerFileHandle(conn, handle, fileName);
  }

  // Create the appropriate view based on file type
  // In web environment, use the registered fileName, not fileRef.path
  const queryFileName = needsFileRegistration() ? fileName : fileRef.path;

  if (fileExt === 'csv') {
    const csvQuery = `CREATE OR REPLACE VIEW ${toDuckDBIdentifier(viewName)} AS SELECT * FROM read_csv(${quote(queryFileName, { single: true })}, strict_mode=false, max_line_size=${CSV_MAX_LINE_SIZE});`;
    console.log('[registerFileSourceAndCreateView] Executing CSV view creation query:', csvQuery);
    try {
      await conn.query(csvQuery);
      console.log('[registerFileSourceAndCreateView] CSV view created successfully for:', viewName);
    } catch (error) {
      console.error('[registerFileSourceAndCreateView] Error creating CSV view:', error);
      throw error;
    }
  } else {
    const query = `CREATE OR REPLACE VIEW ${toDuckDBIdentifier(viewName)} AS SELECT * FROM ${quote(queryFileName, { single: true })};`;
    console.log('[registerFileSourceAndCreateView] Executing view creation query:', query);
    try {
      await conn.query(query);
      console.log('[registerFileSourceAndCreateView] View created successfully for:', viewName);
    } catch (error) {
      console.error('[registerFileSourceAndCreateView] Error creating view:', error);
      throw error;
    }
  }

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
  conn: ConnectionPool,
  viewName: string,
  fileName: string | undefined,
) {
  /**
   * Drop the view
   */
  const dropQuery = buildDropViewQuery(viewName, true);
  await conn.query(dropQuery).catch(console.error);

  if (!fileName || !needsFileRegistration()) {
    // In Tauri, files don't need to be unregistered
    return;
  }

  const db = conn.bindings;

  /**
   * Unregister file handle (web only)
   */
  if (db && typeof db.dropFile === 'function') {
    await db.dropFile(fileName).catch(console.error);
  }
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
  conn: ConnectionPool,
  fileExt: supportedFlatFileDataSourceFileExt,
  fileName: string,
  oldViewName: string,
  newViewName: string,
): Promise<void> {
  /**
   * Drop the old view
   */
  const dropQuery = buildDropViewQuery(oldViewName, true);
  await conn.query(dropQuery).catch(console.error);

  /**
   * Create view with the new name
   */

  if (fileExt === 'csv') {
    await createCSVView(conn, newViewName, fileName);
    return;
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
  conn: ConnectionPool,
  handle: FileSystemFileHandle | null,
  fileName: string,
  dbName: string,
): Promise<File | null> {
  // Get file reference (path for Tauri, filename for web)
  const fileRef = getFileReference(handle, fileName);

  // Detach any existing database with the same name
  const detachQuery = buildDetachQuery(dbName, true);
  await conn.query(detachQuery).catch(console.error);

  if (needsFileRegistration()) {
    // Web environment: register file handle
    if (!handle) throw new Error('FileSystemFileHandle is required for web environment');
    const file = await handle.getFile();

    const db = conn.bindings;
    if (db && typeof db.registerFileHandle === 'function') {
      await db.dropFile(fileName).catch(console.error);
      // Use BROWSER_FILEREADER protocol
      // Pass the File object obtained from the FileSystemFileHandle
      await db.registerFileHandle(fileName, file, DuckDBDataProtocol.BROWSER_FILEREADER, true);
    }
  }

  // Attach database using the appropriate path
  // In web environment, use the registered fileName, not fileRef.path
  let attachPath = needsFileRegistration() ? fileName : fileRef.path;

  // In Tauri on Windows, ensure we use forward slashes for DuckDB
  if (!needsFileRegistration() && attachPath.includes('\\')) {
    console.log('[registerAndAttachDatabase] Converting Windows path to Unix format for DuckDB');
    attachPath = attachPath.replace(/\\/g, '/');
  }

  const attachQuery = buildAttachQuery(attachPath, dbName, { readOnly: true });
  console.log('[registerAndAttachDatabase] Attaching database with query:', attachQuery);
  console.log('[registerAndAttachDatabase] File reference:', fileRef);
  console.log('[registerAndAttachDatabase] Attach path:', attachPath);

  try {
    await conn.query(attachQuery);

    // Verify the database was attached by querying duckdb_databases
    // First, let's see all databases
    const allDbQuery = 'SELECT database_name, internal FROM duckdb_databases';
    const allDbResult = await conn.query(allDbQuery);
    console.log('[registerAndAttachDatabase] All databases after attach:', allDbResult);

    const verifyQuery = `SELECT database_name FROM duckdb_databases WHERE database_name = ${quote(dbName, { single: true })}`;
    const verifyResult = await conn.query(verifyQuery);
    console.log('[registerAndAttachDatabase] Database attach verification:', verifyResult);

    // Also try a direct query to the attached database
    try {
      const directQuery = `SELECT current_database() as current_db, '${dbName}' as expected_db`;
      const directResult = await conn.query(directQuery);
      console.log('[registerAndAttachDatabase] Direct query result:', directResult);
    } catch (e) {
      console.log('[registerAndAttachDatabase] Direct query failed:', e);
    }

    // Force a metadata refresh by running a simple query on the attached database
    try {
      const refreshQuery = `SELECT 1 FROM ${toDuckDBIdentifier(dbName)}.information_schema.tables LIMIT 1`;
      await conn.query(refreshQuery).catch(() => {
        // It's okay if this fails - some databases might not have information_schema
        console.log('[registerAndAttachDatabase] Could not query information_schema, trying alternative');
      });
    } catch (e) {
      // Ignore errors here, this is just to trigger metadata loading
    }
  } catch (error) {
    console.error('[registerAndAttachDatabase] Failed to attach database:', error);
    throw error;
  }

  // Return file object for web, null for Tauri
  return await getFileContent(handle);
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
  conn: ConnectionPool,
  dbName: string,
  fileName: string | undefined,
) {
  /**
   * Detach the database
   */
  const detachQuery = buildDetachQuery(dbName, true);
  await conn.query(detachQuery).catch(console.error);

  if (!fileName || !needsFileRegistration()) {
    // In Tauri, files don't need to be unregistered
    return;
  }

  const db = conn.bindings;

  /**
   * Unregister file handle (web only)
   */
  if (db && typeof db.dropFile === 'function') {
    await db.dropFile(fileName).catch(console.error);
  }
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
  conn: ConnectionPool,
  fileName: string,
  oldDbName: string,
  newDbName: string,
): Promise<void> {
  /**
   * Detach the old database
   */
  const detachOldQuery = buildDetachQuery(oldDbName, true);
  await conn.query(detachOldQuery).catch(console.error);

  /**
   * Detach any existing database with the new name
   */
  const detachNewQuery = buildDetachQuery(newDbName, true);
  await conn.query(detachNewQuery).catch(console.error);

  /**
   * Attach the database with the new name
   */
  const attachQuery = buildAttachQuery(fileName, newDbName, { readOnly: true });
  await conn.query(attachQuery);
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
  conn: ConnectionPool,
  handle: FileSystemFileHandle | null,
  fileName: string,
): Promise<File | null> {
  if (!needsFileRegistration()) {
    // Tauri: no registration needed
    return null;
  }

  // Web: get file from handle
  if (!handle) throw new Error('FileSystemFileHandle is required for web environment');
  const file = await handle.getFile();

  // For web/WASM, the conn.bindings should have the file registration methods
  // This will only work for WASM engine, which is fine since needsFileRegistration()
  // returns false for Tauri
  const db = conn.bindings;

  if (db && typeof db.registerFileHandle === 'function') {
    if (typeof db.dropFile === 'function') {
      await db.dropFile(fileName).catch(console.error);
    }
    // Use BROWSER_FILEREADER protocol
    // Pass the File object obtained from the FileSystemFileHandle
    await db.registerFileHandle(fileName, file, DuckDBDataProtocol.BROWSER_FILEREADER, true);
  } else {
    throw new Error('registerFileHandle method not found on connection pool bindings');
  }

  return file;
}

/**
 * Drop a file
 *
 * @param conn - DuckDB connection pool
 * @param fileName - The name of the file to drop
 */
export async function dropFile(conn: ConnectionPool, fileName: string): Promise<void> {
  if (!needsFileRegistration()) {
    // In Tauri, files don't need to be dropped
    return;
  }

  const db = conn.bindings;

  // Drop file if it already exists (web only)
  if (db && typeof db.dropFile === 'function') {
    await db.dropFile(fileName).catch(console.error);
  }
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
  conn: ConnectionPool,
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
  conn: ConnectionPool,
  fileName: string,
  sheetName: string,
  oldViewName: string,
  newViewName: string,
) {
  /**
   * Drop the old view
   */
  const dropQuery = buildDropViewQuery(oldViewName, true);
  await conn.query(dropQuery).catch(console.error);

  // Create the view with the new name
  const query = createXlsxSheetViewQuery(fileName, sheetName, newViewName);
  await conn.query(query);
}
