import { ConnectionPool } from '@engines/types';
import { CSV_MAX_LINE_SIZE } from '@models/db';
import {
  supportedFlatFileDataSourceFileExt,
  TAURI_ONLY_DATA_SOURCE_FILE_EXTS,
} from '@models/file-system';
import { isTauriEnvironment } from '@utils/browser';
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
  const qualifiedView = `main.${toDuckDBIdentifier(viewName)}`;
  await conn.query(
    `CREATE OR REPLACE VIEW ${qualifiedView} AS SELECT * FROM read_csv(${quote(fileName, { single: true })}, strict_mode=false, max_line_size=${CSV_MAX_LINE_SIZE});`,
  );
}

/**
 * Helper function to create a view for statistical file formats
 * @param conn - DuckDB connection
 * @param viewName - Name of the view to create
 * @param fileName - Name of the statistical file
 */
async function createStatisticalFileView(
  conn: ConnectionPool,
  viewName: string,
  fileName: string,
): Promise<void> {
  if (!isTauriEnvironment()) {
    throw new Error(
      'Statistical file formats (SAS, SPSS, Stata) are only supported in the desktop version. ' +
        'Please download PondPilot Desktop to work with these file types.',
    );
  }

  // Extensions are loaded centrally in the connection pool - no need to load here
  const qualifiedStatsQuery = `CREATE OR REPLACE VIEW main.${toDuckDBIdentifier(viewName)} AS SELECT * FROM read_stat(${quote(fileName, { single: true })});`;

  try {
    await conn.query(qualifiedStatsQuery);
  } catch (queryError) {
    console.error('[createStatisticalFileView] Failed to create view:', queryError);
    throw new Error(`Failed to create view for statistical file: ${queryError}`);
  }
}

// Create a Set for efficient lookup
const STATISTICAL_FILE_EXT_SET = new Set<string>(TAURI_ONLY_DATA_SOURCE_FILE_EXTS);

/**
 * Check if a file extension is a statistical file format
 * @param fileExt - The file extension to check
 */
function isStatisticalFileExt(fileExt: string): boolean {
  return STATISTICAL_FILE_EXT_SET.has(fileExt);
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
  // console.log('[registerFileSourceAndCreateView] Called with:', {
  //   handle: handle ? 'Present' : 'Null',
  //   fileExt,
  //   fileName,
  //   viewName,
  //   needsFileRegistration: needsFileRegistration(),
  // });

  // Get file reference (path for Tauri, filename for web)
  const fileRef = getFileReference(handle, fileName);
  // console.log('[registerFileSourceAndCreateView] File reference:', fileRef);

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
    await createCSVView(conn, viewName, queryFileName);
  } else if (isStatisticalFileExt(fileExt)) {
    await createStatisticalFileView(conn, viewName, queryFileName);
  } else {
    const query = `CREATE OR REPLACE VIEW main.${toDuckDBIdentifier(viewName)} AS SELECT * FROM ${quote(queryFileName, { single: true })};`;
    // console.log('[registerFileSourceAndCreateView] Executing view creation query:', query);
    await conn.query(query);
    // console.log('[registerFileSourceAndCreateView] View created successfully for:', viewName);
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
  await conn.query(dropQuery).catch(() => {
    /* ignore */
  });
  // Also drop qualified view if previously created with schema
  const dropQualified = buildDropViewQuery(`main.${viewName}`, true);
  await conn.query(dropQualified).catch(() => {
    /* ignore */
  });

  if (!fileName || !needsFileRegistration()) {
    // In Tauri, files don't need to be unregistered
    return;
  }

  /**
   * Unregister file handle (web only) using abstracted method
   */
  if (conn.dropFile) {
    await conn.dropFile(fileName).catch(() => {
      /* ignore */
    });
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
  await conn.query(dropQuery).catch(() => {
    /* ignore */
  });
  const dropQualified = buildDropViewQuery(`main.${oldViewName}`, true);
  await conn.query(dropQualified).catch(() => {
    /* ignore */
  });

  /**
   * Create view with the new name
   */

  if (fileExt === 'csv') {
    await createCSVView(conn, newViewName, fileName);
  } else if (isStatisticalFileExt(fileExt)) {
    await createStatisticalFileView(conn, newViewName, fileName);
  } else {
    await conn.query(
      `CREATE OR REPLACE VIEW main.${toDuckDBIdentifier(newViewName)} AS SELECT * FROM ${quote(fileName, { single: true })};`,
    );
  }
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
  let registeredFile: File | null = null;

  // Detach any existing database with the same name
  const detachQuery = buildDetachQuery(dbName, true);
  await conn.query(detachQuery).catch(() => {
    /* ignore */
  });

  if (needsFileRegistration()) {
    // Web environment: register file handle using abstracted method
    if (!handle) throw new Error('FileSystemFileHandle is required for web environment');
    const file = await handle.getFile();
    registeredFile = file;

    if (conn.registerFile) {
      // Drop the file first if it exists
      if (conn.dropFile) {
        await conn.dropFile(fileName).catch(() => {
          /* ignore */
        });
      }

      // Register the file using the abstracted interface
      await conn.registerFile({
        name: fileName,
        type: 'file-handle',
        handle: file,
      });
    }
  }

  // Attach database using the appropriate path
  // In web environment, use the registered fileName, not fileRef.path
  let attachPath = needsFileRegistration() ? fileName : fileRef.path;

  // Note: We no longer rewrite or copy paths; we rely on preflight checks to avoid known-crash patterns

  // In Tauri on Windows, ensure we use forward slashes for DuckDB
  if (!needsFileRegistration() && attachPath.includes('\\')) {
    // console.log('[registerAndAttachDatabase] Converting Windows path to Unix format for DuckDB');
    attachPath = attachPath.replace(/\\/g, '/');
  }

  const attachQuery = buildAttachQuery(attachPath, dbName, { readOnly: true });
  // console.log('[registerAndAttachDatabase] Attaching database with query:', attachQuery);
  // console.log('[registerAndAttachDatabase] File reference:', fileRef);
  // console.log('[registerAndAttachDatabase] Attach path:', attachPath);

  await conn.query(attachQuery);

  // Verify the database was attached by querying duckdb_databases
  // First, let's see all databases
  const allDbQuery = 'SELECT database_name, internal FROM duckdb_databases';
  const _allDbResult = await conn.query(allDbQuery);
  // console.log('[registerAndAttachDatabase] All databases after attach:', _allDbResult);

  const verifyQuery = `SELECT database_name FROM duckdb_databases WHERE database_name = ${quote(dbName, { single: true })}`;
  const _verifyResult = await conn.query(verifyQuery);
  // console.log('[registerAndAttachDatabase] Database attach verification:', _verifyResult);

  // Also try a direct query to the attached database
  try {
    const directQuery = `SELECT current_database() as current_db, '${dbName}' as expected_db`;
    const _directResult = await conn.query(directQuery);
    // console.log('[registerAndAttachDatabase] Direct query result:', _directResult);
  } catch (e) {
    // console.log('[registerAndAttachDatabase] Direct query failed:', e);
  }

  // Force a metadata refresh by running a simple query on the attached database
  try {
    const refreshQuery = `SELECT 1 FROM ${toDuckDBIdentifier(dbName)}.information_schema.tables LIMIT 1`;
    await conn.query(refreshQuery).catch(() => {
      // It's okay if this fails - some databases might not have information_schema
      // console.log(
      //   '[registerAndAttachDatabase] Could not query information_schema, trying alternative',
      // );
    });
  } catch (e) {
    // Ignore errors here, this is just to trigger metadata loading
  }

  // Return file object for web, null for Tauri
  if (registeredFile) {
    return registeredFile;
  }
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
  await conn.query(detachQuery).catch(() => {
    /* ignore */
  });

  if (!fileName || !needsFileRegistration()) {
    // In Tauri, files don't need to be unregistered
    return;
  }

  /**
   * Unregister file handle (web only) using abstracted method
   */
  if (conn.dropFile) {
    await conn.dropFile(fileName).catch(() => {
      /* ignore */
    });
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
  await conn.query(detachOldQuery).catch(() => {
    /* ignore */
  });

  /**
   * Detach any existing database with the new name
   */
  const detachNewQuery = buildDetachQuery(newDbName, true);
  await conn.query(detachNewQuery).catch(() => {
    /* ignore */
  });

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

  // Use the abstracted registerFile method on the connection pool
  // This delegates to the engine's file registration implementation
  if (conn.registerFile) {
    // Drop the file first if it exists
    if (conn.dropFile) {
      await conn.dropFile(fileName).catch(() => {
        /* ignore */
      });
    }

    // Register the file using the abstracted interface
    await conn.registerFile({
      name: fileName,
      type: 'file-handle',
      handle: file,
    });
  } else {
    throw new Error('registerFile method not available on connection pool');
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

  // Use the abstracted dropFile method on the connection pool
  if (conn.dropFile) {
    await conn.dropFile(fileName).catch(() => {
      /* ignore */
    });
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
  await conn.query(dropQuery).catch(() => {
    /* ignore */
  });

  // Create the view with the new name
  const query = createXlsxSheetViewQuery(fileName, sheetName, newViewName);
  await conn.query(query);
}
