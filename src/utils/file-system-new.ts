/**
 * New file system utilities using the platform-agnostic file picker
 * This file provides compatibility adapters for the existing API
 */

import {
  CodeFileExt,
  codeFileExts,
  SUPPORTED_DATA_SOURCE_FILE_EXTS,
  LocalEntryId,
  LocalFile,
  LocalFolder,
  supportedDataSourceFileExt,
} from '@models/file-system';

import { makeIdFactory } from './new-id';
import { getFilePicker } from '../services/file-picker';

export const makeLocalEntryId = makeIdFactory<LocalEntryId>();

export function isSupportedDataSourceFileExt(x: unknown): x is supportedDataSourceFileExt {
  return SUPPORTED_DATA_SOURCE_FILE_EXTS.includes(x as supportedDataSourceFileExt);
}

export function isCodeFileExt(x: unknown): x is CodeFileExt {
  return codeFileExts.includes(x as CodeFileExt);
}

/**
 * Convert a picked file to a LocalFile or null if unsupported
 */
function createLocalFileFromPicked(
  pickedFile: { name: string; handle?: FileSystemFileHandle; path?: string },
  parentId: LocalEntryId | null,
  userAdded: boolean,
  getUniqueAlias: (name: string) => string,
): LocalFile | null {
  const fileName = pickedFile.name;
  const [name, ext] = fileName.split(/\.(?=[^.]+$)/);

  if (!ext) {
    return null;
  }

  const commonFile = {
    kind: 'file' as const,
    id: makeLocalEntryId(),
    name,
    parentId,
    userAdded,
    uniqueAlias: getUniqueAlias(name),
    // Create mock handle for Tauri files if needed
    handle: pickedFile.handle || createMockFileHandleFromPath(pickedFile.name, pickedFile.path),
    // Store the file path for Tauri
    filePath: pickedFile.path,
  };

  const extLower = ext.toLowerCase();

  if (isSupportedDataSourceFileExt(extLower)) {
    return {
      ...commonFile,
      fileType: 'data-source',
      ext: extLower,
    };
  }

  if (isCodeFileExt(extLower)) {
    return {
      ...commonFile,
      fileType: 'code-file',
      ext: extLower,
    };
  }

  return null;
}

/**
 * Convert a picked directory to a LocalFolder
 */
function createLocalFolderFromPicked(
  pickedDirectory: { name: string; handle?: FileSystemDirectoryHandle; path?: string },
  parentId: LocalEntryId | null,
  userAdded: boolean,
  getUniqueAlias: (name: string) => string,
): LocalFolder {
  return {
    kind: 'directory' as const,
    id: makeLocalEntryId(),
    name: pickedDirectory.name,
    parentId,
    userAdded,
    uniqueAlias: getUniqueAlias(pickedDirectory.name),
    // Create mock handle for Tauri directories if needed
    handle:
      pickedDirectory.handle ||
      createMockDirectoryHandleFromPath(pickedDirectory.name, pickedDirectory.path),
    // Store the directory path for Tauri
    directoryPath: pickedDirectory.path,
  };
}

/**
 * Compatibility adapter for the existing pickFiles API
 */
export const pickFiles = async (
  accept: FileExtension[],
  description: string,
  allowMultiple: boolean = true,
): Promise<{ handles: FileSystemFileHandle[]; error: string | null }> => {
  const filePicker = getFilePicker();

  const result = await filePicker.pickFiles({
    accept,
    description,
    multiple: allowMultiple,
  });

  if (result.error) {
    return {
      handles: [],
      error: result.error,
    };
  }

  if (result.cancelled) {
    return {
      handles: [],
      error: null,
    };
  }

  // For web implementation, return the handles directly
  // For Tauri, we'll create mock handles that can be used with the existing system
  const handles: FileSystemFileHandle[] = result.files.map((file) => {
    if (file.handle) {
      return file.handle;
    }

    // Create a mock handle for Tauri files
    return createMockFileHandle(file);
  });

  return {
    handles,
    error: null,
  };
};

/**
 * Compatibility adapter for the existing pickFolder API
 */
export const pickFolder = async (): Promise<{
  handle: FileSystemDirectoryHandle | null;
  error: string | null;
}> => {
  const filePicker = getFilePicker();

  const result = await filePicker.pickDirectory();

  if (result.error) {
    return {
      handle: null,
      error: result.error,
    };
  }

  if (result.cancelled || !result.directory) {
    return {
      handle: null,
      error: null,
    };
  }

  // For web implementation, return the handle directly
  if (result.directory.handle) {
    return {
      handle: result.directory.handle,
      error: null,
    };
  }

  // Create a mock handle for Tauri directories
  return {
    handle: createMockDirectoryHandle(result.directory),
    error: null,
  };
};

/**
 * Create a mock FileSystemFileHandle for Tauri files from path
 */
function createMockFileHandleFromPath(name: string, path?: string): FileSystemFileHandle {
  return createMockFileHandle({ name, path });
}

/**
 * Create a mock FileSystemDirectoryHandle for Tauri directories from path
 */
function createMockDirectoryHandleFromPath(name: string, path?: string): FileSystemDirectoryHandle {
  return createMockDirectoryHandle({ name, path });
}

/**
 * Create a mock FileSystemFileHandle for Tauri files
 */
function createMockFileHandle(pickedFile: {
  name: string;
  path?: string;
  file?: File;
  lastModified?: number;
}): FileSystemFileHandle {
  return {
    kind: 'file',
    name: pickedFile.name,
    getFile: async () => {
      if (pickedFile.file) {
        return pickedFile.file;
      }

      // For Tauri, we need to read the file using Tauri APIs
      if (!pickedFile.path) {
        throw new Error('File path not available');
      }

      const fs = await import('@tauri-apps/api/fs');
      const contents = await fs.readBinaryFile(pickedFile.path);

      return new File([contents], pickedFile.name, {
        lastModified: pickedFile.lastModified || Date.now(),
      });
    },
    queryPermission: async () => 'granted' as PermissionState,
    requestPermission: async () => 'granted' as PermissionState,
    // Add Tauri-specific properties
    _tauriPath: pickedFile.path,
  } as any;
}

/**
 * Create a mock FileSystemDirectoryHandle for Tauri directories
 */
function createMockDirectoryHandle(pickedDirectory: {
  name: string;
  path?: string;
}): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name: pickedDirectory.name,
    async *entries() {
      // This would need to be implemented to read directory contents using Tauri APIs
      // For now, return empty iterator
    },
    async *keys() {},
    async *values() {},
    getDirectoryHandle: async (name: string) => {
      throw new Error('Not implemented for Tauri mock handle');
    },
    getFileHandle: async (name: string) => {
      throw new Error('Not implemented for Tauri mock handle');
    },
    removeEntry: async (name: string) => {
      throw new Error('Not implemented for Tauri mock handle');
    },
    resolve: async (possibleDescendant: FileSystemHandle) => {
      return null;
    },
    queryPermission: async () => 'granted' as PermissionState,
    requestPermission: async () => 'granted' as PermissionState,
    // Add Tauri-specific properties
    _tauriPath: pickedDirectory.path,
  } as any;
}

// Re-export other utilities that don't need to change
export {
  collectFileHandlePersmissions,
  requestFileHandlePersmissions,
  isAvailableFileHandle,
  localEntryFromHandle,
} from './file-system';
