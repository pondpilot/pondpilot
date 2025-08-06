/**
 * Integration utilities for PondPilot to work with the file system adapter
 */

import { SUPPORTED_DATA_SOURCE_FILE_EXTS } from '@models/file-system';
import { getFilePicker } from '../../services/file-picker';
import { isTauriEnvironment } from '@utils/browser';

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
    // For Tauri, use the file picker directly
    if (isTauriEnvironment()) {
      const filePicker = getFilePicker();
      const result = await filePicker.pickFiles({
        accept: accept || [],
        description: description || 'Select files',
        multiple,
      });

      if (result.cancelled || result.error) {
        return {
          handles: [],
          error: result.error || null,
          isFallbackMode: false,
        };
      }

      // Create mock handles for Tauri files
      const handles: FileSystemFileHandle[] = result.files.map((file) => {
        if (file.handle) {
          return file.handle;
        }
        
        // Create a mock handle for files without handles
        return {
          kind: 'file',
          name: file.name,
          getFile: async () => {
            if (file.path) {
              const fs = await import('@tauri-apps/plugin-fs');
              const contents = await fs.readFile(file.path);
              return new File([contents], file.name, {
                lastModified: Date.now(),
              });
            }
            throw new Error('No path available for file');
          },
          queryPermission: async () => 'granted' as PermissionState,
          requestPermission: async () => 'granted' as PermissionState,
          _tauriPath: file.path,
        } as any;
      });

      return {
        handles,
        error: null,
        isFallbackMode: false,
      };
    }

    // For non-Tauri browsers, use the file system service
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
  const extensions = SUPPORTED_DATA_SOURCE_FILE_EXTS.map((ext) => `.${ext}`);
  return pickFilesForPondPilot(extensions, 'Data Source Files', true);
}

/**
 * Pick SQL script files
 */
export async function pickSQLScriptFiles(): Promise<PickFilesResult> {
  return pickFilesForPondPilot(['.sql'], 'SQL Script Files', true);
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
