/**
 * Cross-browser compatible file system controller
 * Handles both native File System Access API and fallback modes
 */

import { showWarning, showAlert } from '@components/app-notifications';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { AnyDataSource, PersistentDataSourceId } from '@models/data-source';
import { LocalEntry, LocalEntryId, LocalFolder } from '@models/file-system';
import { SESSION_STORAGE_KEYS } from '@models/local-storage';
import {
  pickDataSourceFiles,
  pickFolderForPondPilot,
  pickSQLScriptFiles,
  shouldShowBrowserCompatibilityWarning,
  getBrowserCompatibilityInfo,
} from '@utils/file-system-adapter/pondpilot-integration';

import { addLocalFileOrFolders as originalAddLocalFileOrFolders } from './file-system-controller';

/**
 * Enhanced version of addLocalFileOrFolders that handles fallback mode
 */
export const addLocalFileOrFoldersCompat = async (
  conn: AsyncDuckDBConnectionPool,
  handles: (FileSystemDirectoryHandle | FileSystemFileHandle)[],
  fallbackFiles?: File[],
): Promise<{
  skippedExistingEntries: LocalEntry[];
  skippedUnsupportedFiles: string[];
  skippedEmptyFolders: LocalFolder[];
  skippedEmptySheets: { fileName: string; sheets: string[] }[];
  skippedEmptyDatabases: string[];
  newEntries: [LocalEntryId, LocalEntry][];
  newDataSources: [PersistentDataSourceId, AnyDataSource][];
  errors: string[];
}> => {
  const compatInfo = getBrowserCompatibilityInfo();

  // If we're in fallback mode and have fallback files, we need to handle them differently
  if (compatInfo.compatibilityLevel !== 'full') {
    // Show a one-time warning about limitations
    const hasFiles = handles.length > 0 || (fallbackFiles && fallbackFiles.length > 0);

    if (hasFiles && !sessionStorage.getItem(SESSION_STORAGE_KEYS.FALLBACK_MODE_WARNING_SHOWN)) {
      showWarning({
        title: 'Limited File Access Mode',
        message: `Files cannot be persisted in ${compatInfo.browserName}. You'll need to re-select them after refreshing the page. A warning will appear if you try to leave with loaded files.`,
        autoClose: 10000, // Show for 10 seconds
      });
      sessionStorage.setItem(SESSION_STORAGE_KEYS.FALLBACK_MODE_WARNING_SHOWN, 'true');
    }

    // TODO: Implement fallback file handling
    // For now, we'll try to use the wrapped handles
    // In a full implementation, we would:
    // 1. Store files in IndexedDB
    // 2. Create virtual file handles that work with DuckDB
    // 3. Track these separately for re-import on next session
  }

  // Call the original function with the handles
  return originalAddLocalFileOrFolders(conn, handles);
};

/**
 * Pick data source files with cross-browser support
 */
export const pickDataSourceFilesCompat = async (): Promise<{
  handles: FileSystemFileHandle[];
  fallbackFiles?: File[];
  error: string | null;
}> => {
  try {
    const result = await pickDataSourceFiles();

    if (result.isFallbackMode && !result.fallbackFiles) {
      return {
        handles: [],
        error: 'File selection not supported in this browser',
      };
    }

    return {
      handles: result.handles,
      fallbackFiles: result.fallbackFiles,
      error: result.error,
    };
  } catch (error: any) {
    return {
      handles: [],
      error: error.message || 'Unknown error',
    };
  }
};

/**
 * Pick a folder with cross-browser support
 */
export const pickFolderCompat = async (): Promise<{
  handle: FileSystemDirectoryHandle | null;
  fallbackFiles?: File[];
  error: string | null;
}> => {
  try {
    const result = await pickFolderForPondPilot();

    if (result.isFallbackMode && !result.handle && !result.fallbackFiles) {
      return {
        handle: null,
        error: 'Folder selection not supported in this browser',
      };
    }

    return {
      handle: result.handle,
      fallbackFiles: result.fallbackFiles,
      error: result.error,
    };
  } catch (error: any) {
    return {
      handle: null,
      error: error.message || 'Unknown error',
    };
  }
};

/**
 * Pick SQL files with cross-browser support
 */
export const pickSQLFilesCompat = async (): Promise<{
  handles: FileSystemFileHandle[];
  fallbackFiles?: File[];
  error: string | null;
}> => {
  try {
    const result = await pickSQLScriptFiles();

    return {
      handles: result.handles,
      fallbackFiles: result.fallbackFiles,
      error: result.error,
    };
  } catch (error: any) {
    return {
      handles: [],
      error: error.message || 'Unknown error',
    };
  }
};

/**
 * Show browser compatibility info if needed
 */
export const showBrowserCompatibilityInfo = () => {
  if (shouldShowBrowserCompatibilityWarning()) {
    const info = getBrowserCompatibilityInfo();
    showAlert({
      title: `Using ${info.browserName} ${info.browserVersion}`,
      message: info.recommendations[0] || 'Some features may be limited.',
    });
  }
};
