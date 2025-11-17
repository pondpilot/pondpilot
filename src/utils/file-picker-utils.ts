/**
 * Platform-agnostic file picker utilities
 * This file provides compatibility adapters for the existing file picker API
 */

import { LocalEntryId, LocalFile, LocalFolder } from '@models/file-system';

import {
  createUnifiedFileHandle,
  createUnifiedDirectoryHandle,
  createMockFileSystemFileHandle,
  createMockFileSystemDirectoryHandle,
} from './file-handle';
import { makeLocalEntryId, isSupportedDataSourceFileExt, isCodeFileExt } from './file-system';
import { getFilePicker } from '../services/file-picker';

/**
 * Convert a picked file to a LocalFile or null if unsupported
 */
function _createLocalFileFromPicked(
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
function _createLocalFolderFromPicked(
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
  accept: string[],
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
  // If we have a path, create a unified handle
  if (pickedFile.path) {
    const unifiedHandle = createUnifiedFileHandle(pickedFile.path, pickedFile.name);
    return createMockFileSystemFileHandle(unifiedHandle);
  }

  // Otherwise, create a basic mock handle
  return {
    kind: 'file',
    name: pickedFile.name,
    getFile: async () => {
      if (pickedFile.file) {
        return pickedFile.file;
      }
      throw new Error('No file data available');
    },
    queryPermission: async () => 'granted' as PermissionState,
    requestPermission: async () => 'granted' as PermissionState,
    createWritable: async () => {
      throw new Error('Write not supported');
    },
    isSameEntry: async (_other: FileSystemHandle) => false,
    isFile: true,
    isDirectory: false,
  } as FileSystemFileHandle;
}

/**
 * Create a mock FileSystemDirectoryHandle for Tauri directories
 */
function createMockDirectoryHandle(pickedDirectory: {
  name: string;
  path?: string;
}): FileSystemDirectoryHandle {
  // If we have a path, create a unified handle
  if (pickedDirectory.path) {
    const unifiedHandle = createUnifiedDirectoryHandle(pickedDirectory.path, pickedDirectory.name);
    return createMockFileSystemDirectoryHandle(unifiedHandle);
  }

  // Otherwise, create a basic mock handle
  const handle = {
    kind: 'directory' as const,
    name: pickedDirectory.name,
    async *entries() {
      // Empty iterator
    },
    async *keys() {
      // Empty iterator
    },
    async *values() {
      // Empty iterator
    },
    getDirectoryHandle: async (_name: string) => {
      throw new Error('Not implemented for mock handle');
    },
    getFileHandle: async (_name: string) => {
      throw new Error('Not implemented for mock handle');
    },
    removeEntry: async (_name: string) => {
      throw new Error('Not implemented for mock handle');
    },
    resolve: async (_possibleDescendant: FileSystemHandle) => {
      return null;
    },
    queryPermission: async () => 'granted' as PermissionState,
    requestPermission: async () => 'granted' as PermissionState,
    isSameEntry: async (_other: FileSystemHandle) => false,
    isFile: false,
    isDirectory: true,
  };

  // Add missing methods
  (handle as any).getFile = undefined;
  (handle as any).getDirectory = undefined;
  (handle as any).getEntries = function getEntries() {
    return this.entries();
  };
  (handle as any)[Symbol.asyncIterator] = function asyncIterator() {
    return this.entries();
  };

  return handle as unknown as FileSystemDirectoryHandle;
}

// Re-export utilities from file-system.ts for convenience
export {
  makeLocalEntryId,
  isSupportedDataSourceFileExt,
  isCodeFileExt,
  collectFileHandlePersmissions,
  requestFileHandlePersmissions,
  isAvailableFileHandle,
  localEntryFromHandle,
} from './file-system';
