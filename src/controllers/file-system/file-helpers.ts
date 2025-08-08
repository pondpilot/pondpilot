/**
 * Helper functions for file handling in file-system-controller
 */

import { DataSourceLocalFile } from '@models/file-system';
import { isTauriEnvironment } from '@utils/browser';
import { convertLegacyHandle } from '@utils/file-handle';

/**
 * Get the appropriate file reference for DuckDB operations
 * In Tauri: returns the full file path
 * In Web: returns the unique alias with extension
 */
export function getFileReferenceForDuckDB(file: DataSourceLocalFile): string {
  if (isTauriEnvironment()) {
    // First check if file has a stored path
    const tauriPath = (file as any).filePath || (file as any).tauriPath;
    if (tauriPath) {
      return tauriPath;
    }

    // Try to extract path from the handle via unified wrapper (in case state lacked filePath)
    if (file.handle) {
      const unified = convertLegacyHandle(file.handle);
      const path = unified?.getPath();
      if (path) return path;
    }

    // If no stored path, throw error
    throw new Error(`Tauri file missing file path: ${file.name}`);
  }
  // Web environment uses registered filename
  return `${file.uniqueAlias}.${file.ext}`;
}

/**
 * Check if a path contains characters that require special handling in DuckDB.
 * This includes checking for SQL injection risks and characters that need escaping.
 */
export function isConservativeSafePath(path: string): boolean {
  // Check for SQL injection attempts - these should never appear in legitimate file paths
  const sqlInjectionPatterns = [
    /;.*(?:DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE)/i,
    /--\s*$/, // SQL comment at end
    /\/\*.*\*\//, // SQL block comment
    /'\s*OR\s*'?\d*'\s*=\s*'?\d*/, // Classic SQL injection
  ];

  for (const pattern of sqlInjectionPatterns) {
    if (pattern.test(path)) {
      return false;
    }
  }

  // These characters should not appear in file paths and could cause issues
  const dangerousChars = ['\0', '\n', '\r', '\t'];
  for (const char of dangerousChars) {
    if (path.includes(char)) {
      return false;
    }
  }

  // Path is safe - spaces and other common characters are allowed
  return true;
}

/**
 * Escape a file path for safe use in DuckDB SQL statements.
 * DuckDB uses single quotes for string literals, so we need to escape them.
 */
export function escapeDuckDBPath(path: string): string {
  // In DuckDB, single quotes in string literals are escaped by doubling them
  return path.replace(/'/g, "''");
}

/**
 * Check if we can get file content (File object)
 * In Tauri: we can't get File objects from handles
 * In Web: we can get File objects from handles
 */
export function canGetFileContent(): boolean {
  return !isTauriEnvironment();
}

/**
 * Get file content if possible
 * Returns null in Tauri environment
 */
export async function getFileContentSafe(
  handle: FileSystemFileHandle | null,
): Promise<File | null> {
  if (!canGetFileContent() || !handle) {
    return null;
  }
  try {
    return await handle.getFile();
  } catch (error) {
    console.error('Failed to get file content:', error);
    return null;
  }
}
