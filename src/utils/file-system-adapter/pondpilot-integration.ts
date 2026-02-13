/**
 * Integration utilities for PondPilot to work with the file system adapter
 */

import { SUPPORTED_DATA_SOURCE_FILE_EXTS } from '@models/file-system';

import { fileSystemService } from './file-system-service';
import { createFileHandleWrapper, createDirectoryHandleWrapper } from './handle-converter';

interface PickFilesResult {
  handles: FileSystemFileHandle[];
  fallbackFiles?: File[];
  error: string | null;
  isFallbackMode: boolean;
}

interface PickFolderResult {
  handle: FileSystemDirectoryHandle | null;
  fallbackFiles?: File[];
  error: string | null;
  isFallbackMode: boolean;
}

/**
 * Pick files with proper fallback handling for PondPilot
 */
export async function pickFilesForPondPilot(
  accept?: string[],
  description?: string,
  multiple: boolean = true,
): Promise<PickFilesResult> {
  try {
    // Build accept object
    const acceptObj: Record<string, string[]> = {};
    if (accept && accept.length > 0) {
      acceptObj['application/octet-stream'] = accept;
    }

    const result = await fileSystemService.pickFiles({
      accept: acceptObj,
      description,
      multiple,
      excludeAcceptAllOption: false,
    });

    if (!result.success) {
      return {
        handles: [],
        error: result.error,
        isFallbackMode: false,
      };
    }

    if (result.type === 'fallback') {
      // In fallback mode, create wrapped handles
      const wrappedHandles: FileSystemFileHandle[] = [];

      for (const file of result.files) {
        const handle = {
          kind: 'file' as const,
          name: file.name,
          getFile: async () => file,
        };
        wrappedHandles.push(createFileHandleWrapper(handle));
      }

      return {
        handles: wrappedHandles,
        fallbackFiles: result.files,
        error: null,
        isFallbackMode: true,
      };
    }
    // Native mode
    return {
      handles: result.handles,
      error: null,
      isFallbackMode: false,
    };
  } catch (error: any) {
    return {
      handles: [],
      error: error.message || 'Unknown error',
      isFallbackMode: false,
    };
  }
}

/**
 * Pick a folder with proper fallback handling
 */
export async function pickFolderForPondPilot(): Promise<PickFolderResult> {
  try {
    const result = await fileSystemService.pickDirectory({
      mode: 'read',
    });

    if (!result.success) {
      return {
        handle: null,
        error: result.error,
        isFallbackMode: false,
      };
    }

    if (result.type === 'fallback') {
      // In fallback mode, we have flat files
      // Create a legacy DirectoryHandle for compatibility
      const legacyHandle = await fileSystemService.pickDirectoryLegacy({ mode: 'read' });

      return {
        handle: legacyHandle ? createDirectoryHandleWrapper(legacyHandle) : null,
        fallbackFiles: result.files,
        error: null,
        isFallbackMode: true,
      };
    }
    // Native mode
    return {
      handle: result.handle,
      error: null,
      isFallbackMode: false,
    };
  } catch (error: any) {
    return {
      handle: null,
      error: error.message || 'Unknown error',
      isFallbackMode: false,
    };
  }
}

/**
 * Pick data source files specifically for PondPilot
 */
export async function pickDataSourceFiles(): Promise<PickFilesResult> {
  const extensions = [
    ...SUPPORTED_DATA_SOURCE_FILE_EXTS.map((ext) => `.${ext}`),
    '.sqlnb',
  ];
  return pickFilesForPondPilot(extensions, 'Data Source & Notebook Files', true);
}

/**
 * Pick SQL script files
 */
export async function pickSQLScriptFiles(): Promise<PickFilesResult> {
  return pickFilesForPondPilot(['.sql', '.sqlnb'], 'Query Files', true);
}

/**
 * Check if the browser needs to show compatibility warnings
 */
export function shouldShowBrowserCompatibilityWarning(): boolean {
  return fileSystemService.shouldShowCompatibilityWarning();
}

/**
 * Get browser compatibility information for display
 */
export function getBrowserCompatibilityInfo() {
  const info = fileSystemService.getBrowserInfo();
  const recommendations = fileSystemService.getBrowserRecommendations();

  return {
    browserName: info.name,
    browserVersion: info.version,
    compatibilityLevel: info.level,
    limitations: info.limitations,
    recommendations,
    capabilities: info.capabilities,
  };
}
