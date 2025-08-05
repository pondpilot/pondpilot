/**
 * Utility functions for handling FileSystemHandle null checks
 * Provides backward compatibility for Tauri support
 */

import { LocalFile, LocalFolder } from '@models/file-system';

import { isTauriEnvironment } from './browser';

/**
 * Check if a file handle is available (not null and can be accessed)
 */
export function isFileHandleAvailable(file: LocalFile): boolean {
  if (isTauriEnvironment()) {
    // In Tauri, we use file paths instead of handles
    return Boolean(file.filePath);
  }
  return file.handle !== null;
}

/**
 * Check if a directory handle is available (not null and can be accessed)
 */
export function isDirectoryHandleAvailable(folder: LocalFolder): boolean {
  if (isTauriEnvironment()) {
    // In Tauri, we use directory paths instead of handles
    return Boolean(folder.directoryPath);
  }
  return folder.handle !== null;
}

/**
 * Get the effective handle for a file (returns handle or creates a mock one for Tauri)
 */
export function getEffectiveFileHandle(file: LocalFile): FileSystemFileHandle {
  if (file.handle) {
    return file.handle;
  }

  if (isTauriEnvironment() && file.filePath) {
    // Create a mock handle for Tauri
    return createTauriMockFileHandle(file);
  }

  throw new Error('File handle not available');
}

/**
 * Get the effective handle for a directory (returns handle or creates a mock one for Tauri)
 */
export function getEffectiveDirectoryHandle(folder: LocalFolder): FileSystemDirectoryHandle {
  if (folder.handle) {
    return folder.handle;
  }

  if (isTauriEnvironment() && folder.directoryPath) {
    // Create a mock handle for Tauri
    return createTauriMockDirectoryHandle(folder);
  }

  throw new Error('Directory handle not available');
}

/**
 * Create a mock FileSystemFileHandle for Tauri files
 */
function createTauriMockFileHandle(file: LocalFile): FileSystemFileHandle {
  return {
    kind: 'file',
    name: `${file.name}${file.fileType === 'data-source' ? `.${file.ext}` : file.fileType === 'code-file' ? `.${file.ext}` : ''}`,
    getFile: async () => {
      if (!file.filePath) {
        throw new Error('File path not available');
      }

      // Read file using Tauri APIs
      const fs = await import('@tauri-apps/plugin-fs');
      const contents = await fs.readFile(file.filePath);

      return new File([contents], file.name, {
        lastModified: Date.now(),
      });
    },
    queryPermission: async () => 'granted' as PermissionState,
    requestPermission: async () => 'granted' as PermissionState,
    _tauriPath: file.filePath,
  } as any;
}

/**
 * Create a mock FileSystemDirectoryHandle for Tauri directories
 */
function createTauriMockDirectoryHandle(folder: LocalFolder): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name: folder.name,
    async* entries() {
      // This would need to be implemented to read directory contents using Tauri APIs
    },
    async* keys() {},
    async* values() {},
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
    _tauriPath: folder.directoryPath,
  } as any;
}
