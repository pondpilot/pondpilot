import { ConnectionPool } from '@engines/types';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { OPFSUtil } from '@utils/opfs';

export interface ClipboardImportError extends Error {
  code: 'INVALID_JSON' | 'INVALID_CSV' | 'OPFS_ERROR' | 'DUCKDB_ERROR' | 'UNKNOWN_ERROR';
}

/**
 * Validates if text is valid JSON
 */
export function validateJSON(text: string): { isValid: boolean; error?: string } {
  try {
    const parsed = JSON.parse(text);

    // Check if it's an array or object (not just a primitive value)
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        isValid: false,
        error: 'JSON must be an object or array, not a primitive value',
      };
    }

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Invalid JSON format',
    };
  }
}

/**
 * Basic CSV validation - checks if it has at least one comma or tab delimiter
 */
export function validateCSV(text: string): { isValid: boolean; error?: string } {
  const lines = text.trim().split('\n');

  if (lines.length === 0) {
    return {
      isValid: false,
      error: 'CSV cannot be empty',
    };
  }

  // Check if first line has delimiters (comma or tab)
  const firstLine = lines[0];
  const hasCommas = firstLine.includes(',');
  const hasTabs = firstLine.includes('\t');

  if (!hasCommas && !hasTabs) {
    return {
      isValid: false,
      error: 'CSV must contain comma or tab delimiters',
    };
  }

  return { isValid: true };
}

/**
 * Formats content for the specified format
 */
export function formatContent(text: string, format: 'json' | 'csv'): string {
  if (format === 'json') {
    // Pretty format JSON
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  }

  // For CSV, when hasHeaders is false, let DuckDB handle column naming
  // No need to add generated headers - DuckDB will use column0, column1, etc.

  // For CSV with headers or fallback, return as-is but ensure it ends with a newline
  return `${text.trim()}\n`;
}

/**
 * Creates a file in OPFS from clipboard content and returns FileSystemFileHandle
 */
export async function importClipboardAsFile(
  clipboardText: string,
  fileName: string,
  format: 'json' | 'csv',
): Promise<FileSystemFileHandle> {
  try {
    // Validate content based on format
    if (format === 'json') {
      const validation = validateJSON(clipboardText);
      if (!validation.isValid) {
        const error = new Error(`Invalid JSON: ${validation.error}`) as ClipboardImportError;
        error.code = 'INVALID_JSON';
        throw error;
      }
    } else if (format === 'csv') {
      const validation = validateCSV(clipboardText);
      if (!validation.isValid) {
        const error = new Error(`Invalid CSV: ${validation.error}`) as ClipboardImportError;
        error.code = 'INVALID_CSV';
        throw error;
      }
    }

    // Format the content
    const formattedContent = formatContent(clipboardText, format);

    // Create OPFS file
    const opfsUtil = new OPFSUtil();
    const filePath = `clipboard-imports/${fileName}.${format}`;

    try {
      await opfsUtil.storeFile(filePath, new TextEncoder().encode(formattedContent));
    } catch (error) {
      const opfsError = new Error(`Failed to store file in OPFS: ${error}`) as ClipboardImportError;
      opfsError.code = 'OPFS_ERROR';
      throw opfsError;
    }

    // Get FileSystemFileHandle
    try {
      return await opfsUtil.getFileHandle(filePath, false);
    } catch (error) {
      const handleError = new Error(`Failed to get file handle: ${error}`) as ClipboardImportError;
      handleError.code = 'OPFS_ERROR';
      throw handleError;
    }
  } catch (error) {
    if ((error as ClipboardImportError).code) {
      throw error;
    }

    const unknownError = new Error(`Unknown error during import: ${error}`) as ClipboardImportError;
    unknownError.code = 'UNKNOWN_ERROR';
    throw unknownError;
  }
}

/**
 * Creates a table in DuckDB from clipboard content
 */
export async function importClipboardAsTable(
  conn: ConnectionPool,
  clipboardText: string,
  tableName: string,
  format: 'json' | 'csv',
  hasHeaders?: boolean,
): Promise<void> {
  try {
    // Validate content based on format
    if (format === 'json') {
      const validation = validateJSON(clipboardText);
      if (!validation.isValid) {
        const error = new Error(`Invalid JSON: ${validation.error}`) as ClipboardImportError;
        error.code = 'INVALID_JSON';
        throw error;
      }
    } else if (format === 'csv') {
      const validation = validateCSV(clipboardText);
      if (!validation.isValid) {
        const error = new Error(`Invalid CSV: ${validation.error}`) as ClipboardImportError;
        error.code = 'INVALID_CSV';
        throw error;
      }
    }

    // Format the content
    const formattedContent = formatContent(clipboardText, format);

    // Create temporary file name
    const tempFileName = `temp_clipboard_${Date.now()}.${format}`;

    // Create OPFS file
    const opfsUtil = new OPFSUtil();
    try {
      await opfsUtil.storeFile(tempFileName, new TextEncoder().encode(formattedContent));
    } catch (error) {
      const opfsError = new Error(
        `Failed to store temp file in OPFS: ${error}`,
      ) as ClipboardImportError;
      opfsError.code = 'OPFS_ERROR';
      throw opfsError;
    }

    // Get file handle and register in DuckDB
    let fileHandle: FileSystemFileHandle;
    try {
      fileHandle = await opfsUtil.getFileHandle(tempFileName, false);
      const file = await fileHandle.getFile();

      // Register the file handle with DuckDB using abstracted method
      if (conn.registerFile) {
        await conn.registerFile({
          name: tempFileName,
          type: 'file-handle',
          handle: file,
        });
      } else {
        throw new Error('registerFile method not available on connection pool');
      }
    } catch (error) {
      // Cleanup OPFS file if registration fails
      await opfsUtil.deleteFile(tempFileName).catch(console.error);
      const regError = new Error(
        `Failed to register file with DuckDB: ${error}`,
      ) as ClipboardImportError;
      regError.code = 'DUCKDB_ERROR';
      throw regError;
    }

    // Create table with appropriate reader function
    try {
      const safeTableName = toDuckDBIdentifier(tableName);
      let createQuery: string;

      if (format === 'csv') {
        createQuery = hasHeaders
          ? `CREATE TABLE ${safeTableName} AS SELECT * FROM read_csv('${tempFileName}', auto_detect=true)`
          : `CREATE TABLE ${safeTableName} AS SELECT * FROM read_csv('${tempFileName}', header=false, auto_detect=true)`;
      } else {
        createQuery = `CREATE TABLE ${safeTableName} AS SELECT * FROM read_json_auto('${tempFileName}')`;
      }

      await conn.query(createQuery);
    } catch (error) {
      // Cleanup on table creation failure using abstracted method
      if (conn.dropFile) {
        await conn.dropFile(tempFileName).catch(console.error);
      }
      await opfsUtil.deleteFile(tempFileName).catch(console.error);
      const tableError = new Error(`Failed to create table: ${error}`) as ClipboardImportError;
      tableError.code = 'DUCKDB_ERROR';
      throw tableError;
    }

    // Cleanup: remove temporary file using abstracted method
    try {
      if (conn.dropFile) {
        await conn.dropFile(tempFileName);
      }
      await opfsUtil.deleteFile(tempFileName);
    } catch (error) {
      // Log cleanup errors but don't fail the import
      console.warn(`Failed to cleanup temporary file ${tempFileName}:`, error);
    }
  } catch (error) {
    if ((error as ClipboardImportError).code) {
      throw error;
    }

    const unknownError = new Error(
      `Unknown error during table import: ${error}`,
    ) as ClipboardImportError;
    unknownError.code = 'UNKNOWN_ERROR';
    throw unknownError;
  }
}
