import * as duckdb from '@duckdb/duckdb-wasm';
import type { GSheetAccessMode } from '@models/data-source';
import { CSV_MAX_LINE_SIZE } from '@models/db';
import { ReadStatViewType, supportedFlatFileDataSourceFileExt } from '@models/file-system';
import { AsyncDuckDBConnectionPool } from '@services/duckdb-pool/duckdb-connection-pool';
import { isReadStatViewType } from '@utils/data-source';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { createGSheetSheetViewQuery, extractGSheetSpreadsheetId } from '@utils/gsheet';
import { buildCreateGSheetSecretQuery, buildGSheetHttpSecretName } from '@utils/gsheet-auth';
import { quote } from '@utils/helpers';
import { buildAttachQuery, buildDetachQuery, buildDropViewQuery } from '@utils/sql-builder';
import { createXlsxSheetViewQuery } from '@utils/xlsx';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const withContext = (context: string, error: unknown, rollbackError?: unknown): Error => {
  const rollbackContext = rollbackError
    ? `. Rollback also failed: ${errorMessage(rollbackError)}`
    : '';
  return new Error(`${context}: ${errorMessage(error)}${rollbackContext}`, { cause: error });
};

/**
 * Helper function to create a view for CSV files with proper configuration
 * @param conn - DuckDB connection
 * @param viewName - Name of the view to create
 * @param fileName - Name of the CSV file
 */
async function createCSVView(
  conn: AsyncDuckDBConnectionPool,
  viewName: string,
  fileName: string,
): Promise<void> {
  await conn.query(
    `CREATE OR REPLACE VIEW ${toDuckDBIdentifier(viewName)} AS SELECT * FROM read_csv(${quote(fileName, { single: true })}, strict_mode=false, max_line_size=${CSV_MAX_LINE_SIZE});`,
  );
}

async function createReadStatView(
  conn: AsyncDuckDBConnectionPool,
  viewName: string,
  fileExt: ReadStatViewType,
  fileName: string,
): Promise<void> {
  const sanitizedView = toDuckDBIdentifier(viewName);
  const sanitizedFile = quote(fileName, { single: true });
  // zsav is compressed SPSS; the read_stat extension uses 'sav' for both
  const format = fileExt === 'zsav' ? 'sav' : fileExt;
  const sanitizedFormat = quote(format, { single: true });
  const query =
    `CREATE OR REPLACE VIEW ${sanitizedView} ` +
    `AS SELECT * FROM read_stat(${sanitizedFile}, format=${sanitizedFormat});`;
  await conn.query(query);
}

/**
 * Register regular data source file (not a databse) and create a view
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
  try {
    await db.dropFile(fileName);
  } catch {
    // First-time registration normally has nothing to drop. registerFileHandle below is the
    // authoritative operation and will still fail if an existing registration cannot be replaced.
  }

  /**
   * Register file handle
   */
  try {
    await db.registerFileHandle(fileName, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);
  } catch (error) {
    throw withContext(`Failed to register file "${fileName}"`, error);
  }

  try {
    if (isReadStatViewType(fileExt)) {
      await createReadStatView(conn, viewName, fileExt, fileName);
      return file;
    }

    if (fileExt === 'csv') {
      await createCSVView(conn, viewName, fileName);
      return file;
    }

    await conn.query(
      `CREATE OR REPLACE VIEW ${toDuckDBIdentifier(viewName)} AS SELECT * FROM ${quote(fileName, { single: true })};`,
    );
    return file;
  } catch (error) {
    try {
      await db.dropFile(fileName);
    } catch (rollbackError) {
      throw withContext(
        `Failed to create view "${viewName}" for file "${fileName}"`,
        error,
        rollbackError,
      );
    }
    throw withContext(`Failed to create view "${viewName}" for file "${fileName}"`, error);
  }
}

/**
 * Drop a view and unregister its file handle
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
  const dropQuery = buildDropViewQuery(viewName, true);
  try {
    await conn.query(dropQuery);
  } catch (error) {
    throw withContext(`Failed to drop view "${viewName}"`, error);
  }

  if (!fileName) {
    return;
  }

  const db = conn.bindings;

  /**
   * Unregister file handle
   */
  try {
    await db.dropFile(fileName);
  } catch (error) {
    throw withContext(`Failed to unregister file "${fileName}"`, error);
  }
}

/**
 * Recreate a view with a new name
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
  const createView = async () => {
    if (isReadStatViewType(fileExt)) {
      await createReadStatView(conn, newViewName, fileExt, fileName);
      return;
    }

    if (fileExt === 'csv') {
      await createCSVView(conn, newViewName, fileName);
      return;
    }

    await conn.query(
      `CREATE OR REPLACE VIEW ${toDuckDBIdentifier(newViewName)} AS SELECT * FROM ${quote(fileName, { single: true })};`,
    );
  };

  try {
    await createView();
  } catch (error) {
    throw withContext(`Failed to create replacement view "${newViewName}"`, error);
  }

  if (oldViewName === newViewName) {
    return;
  }

  const dropQuery = buildDropViewQuery(oldViewName, true);
  try {
    await conn.query(dropQuery);
  } catch (error) {
    try {
      await conn.query(buildDropViewQuery(newViewName, true));
    } catch (rollbackError) {
      throw withContext(
        `Failed to replace view "${oldViewName}" with "${newViewName}"`,
        error,
        rollbackError,
      );
    }
    throw withContext(`Failed to replace view "${oldViewName}" with "${newViewName}"`, error);
  }
}

/**
 * Register a database file and attach it to the DuckDB instance
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
  try {
    await db.dropFile(fileName);
  } catch {
    // First-time registration normally has nothing to drop. registerFileHandle below is the
    // authoritative operation and will still fail if an existing registration cannot be replaced.
  }

  /**
   * Register file handle
   */
  try {
    await db.registerFileHandle(fileName, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);
  } catch (error) {
    throw withContext(`Failed to register database file "${fileName}"`, error);
  }

  /**
   * Detach any existing database with the same name
   */
  const detachQuery = buildDetachQuery(dbName, true);
  try {
    await conn.query(detachQuery);
  } catch (error) {
    try {
      await db.dropFile(fileName);
    } catch (rollbackError) {
      throw withContext(
        `Failed to prepare database "${dbName}" for attachment`,
        error,
        rollbackError,
      );
    }
    throw withContext(`Failed to prepare database "${dbName}" for attachment`, error);
  }

  /**
   * Attach the database
   */
  const attachQuery = buildAttachQuery(fileName, dbName, { readOnly: true });
  try {
    await conn.query(attachQuery);
  } catch (error) {
    try {
      await db.dropFile(fileName);
    } catch (rollbackError) {
      throw withContext(
        `Failed to attach database "${dbName}" from file "${fileName}"`,
        error,
        rollbackError,
      );
    }
    throw withContext(`Failed to attach database "${dbName}" from file "${fileName}"`, error);
  }

  return file;
}

/**
 * Detach a database and unregister its file handle
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
  const detachQuery = buildDetachQuery(dbName, true);
  try {
    await conn.query(detachQuery);
  } catch (error) {
    throw withContext(`Failed to detach database "${dbName}"`, error);
  }

  if (!fileName) {
    return;
  }

  const db = conn.bindings;

  /**
   * Unregister file handle
   */
  try {
    await db.dropFile(fileName);
  } catch (error) {
    throw withContext(`Failed to unregister database file "${fileName}"`, error);
  }
}

/**
 * Detach old database and register a new one
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
  const detachOldQuery = buildDetachQuery(oldDbName, true);
  try {
    await conn.query(detachOldQuery);
  } catch (error) {
    throw withContext(`Failed to detach database "${oldDbName}" for rename`, error);
  }

  try {
    if (oldDbName !== newDbName) {
      const detachNewQuery = buildDetachQuery(newDbName, true);
      await conn.query(detachNewQuery);
    }

    const attachQuery = buildAttachQuery(fileName, newDbName, { readOnly: true });
    await conn.query(attachQuery);
  } catch (error) {
    try {
      const rollbackQuery = buildAttachQuery(fileName, oldDbName, { readOnly: true });
      await conn.query(rollbackQuery);
    } catch (rollbackError) {
      throw withContext(
        `Failed to rename database "${oldDbName}" to "${newDbName}"`,
        error,
        rollbackError,
      );
    }
    throw withContext(`Failed to rename database "${oldDbName}" to "${newDbName}"`, error);
  }
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
 * Create a view for a Google Sheets worksheet.
 *
 * When the gsheets extension is loaded, uses `read_gsheet()` directly.
 * For authenticated access, creates a `TYPE GSHEET` DuckDB secret so the
 * extension can pass the token to Google's API natively.
 *
 * @param conn - DuckDB connection pool
 * @param spreadsheetRef - Google Sheets URL or spreadsheet ID
 * @param sheetName - Worksheet name to read
 * @param viewName - A valid, unique identifier of the view to create.
 */
export async function createGSheetSheetView(
  conn: AsyncDuckDBConnectionPool,
  spreadsheetRef: string,
  sheetName: string | undefined,
  viewName: string,
  accessMode: GSheetAccessMode = 'public',
  accessToken?: string,
  connectionKey?: string,
) {
  const pooled = await conn.getPooledConnection();
  try {
    const needsBearerToken = accessMode === 'authorized' || accessMode === 'oauth';
    let secretName: string | undefined;
    if (needsBearerToken) {
      if (!accessToken) {
        throw new Error('A Google API bearer token is required for authenticated reads');
      }
      const spreadsheetId = extractGSheetSpreadsheetId(spreadsheetRef);
      if (!spreadsheetId) {
        throw new Error('Unable to determine Google Sheets spreadsheet ID');
      }
      if (!connectionKey) {
        throw new Error('A connection key is required for authenticated reads');
      }
      secretName = buildGSheetHttpSecretName(spreadsheetId, connectionKey);
      await pooled.query(buildCreateGSheetSecretQuery(secretName, accessToken));
    }
    const query = createGSheetSheetViewQuery(
      spreadsheetRef,
      sheetName,
      viewName,
      'system.main.read_gsheet',
      secretName,
    );
    await pooled.query(query);
  } finally {
    await pooled.close();
  }
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
  const dropQuery = buildDropViewQuery(oldViewName, true);
  await conn.query(dropQuery).catch(console.error);

  // Create the view with the new name
  const query = createXlsxSheetViewQuery(fileName, sheetName, newViewName);
  await conn.query(query);
}
