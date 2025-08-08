/**
 * Utility functions for handling FileSystemHandle null checks
 * Provides backward compatibility for Tauri support
 */

import { LocalFile, LocalFolder } from '@models/file-system';

import { isTauriEnvironment } from './browser';
import {
  createUnifiedFileHandle,
  createUnifiedDirectoryHandle,
  createMockFileSystemFileHandle,
  createMockFileSystemDirectoryHandle,
} from './file-handle';

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
  if (!file.filePath) {
    throw new Error('File path not available');
  }

  const fileName = `${file.name}${file.fileType === 'data-source' ? `.${file.ext}` : file.fileType === 'code-file' ? `.${file.ext}` : ''}`;
  const unifiedHandle = createUnifiedFileHandle(file.filePath, fileName);

  // Create a mock FileSystemFileHandle
  return createMockFileSystemFileHandle(unifiedHandle);
}

/**
 * Create a mock FileSystemDirectoryHandle for Tauri directories
 */
function createTauriMockDirectoryHandle(folder: LocalFolder): FileSystemDirectoryHandle {
  if (!folder.directoryPath) {
    throw new Error('Directory path not available');
  }

  const unifiedHandle = createUnifiedDirectoryHandle(folder.directoryPath, folder.name);

  // Create a mock FileSystemDirectoryHandle
  return createMockFileSystemDirectoryHandle(unifiedHandle);
}
