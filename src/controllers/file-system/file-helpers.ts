/**
 * Helper functions for file handling in file-system-controller
 */

import { DataSourceLocalFile } from '@models/file-system';
import { isTauriEnvironment } from '@utils/browser';

/**
 * Get the appropriate file reference for DuckDB operations
 * In Tauri: returns the full file path
 * In Web: returns the unique alias with extension
 */
export function getFileReferenceForDuckDB(file: DataSourceLocalFile): string {
  if (isTauriEnvironment()) {
    const tauriPath = (file.handle as any)?._tauriPath;
    if (!tauriPath) {
      throw new Error(`Tauri file missing _tauriPath: ${file.name}`);
    }
    return tauriPath;
  }
  // Web environment uses registered filename
  return `${file.uniqueAlias}.${file.ext}`;
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
