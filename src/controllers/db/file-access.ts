/**
 * File access abstraction layer for handling files in both web and Tauri environments
 */

import { isTauriEnvironment } from '@utils/browser';

export interface FileReference {
  path: string;
  handle: FileSystemFileHandle | null;
  isWebHandle: boolean;
}

/**
 * Get a file reference from a handle, abstracting web vs Tauri differences
 */
export function getFileReference(
  handle: FileSystemFileHandle | null,
  fallbackName: string,
): FileReference {
  if (isTauriEnvironment()) {
    // In Tauri, use the path directly
    const tauriPath = (handle as any)?._tauriPath;
    if (!tauriPath) {
      // If no _tauriPath, use the fallback name as the path
      // This can happen during restoration from persistence
      console.warn(
        'Tauri file handle missing _tauriPath property, using fallback name:',
        fallbackName,
      );
      return {
        path: fallbackName,
        handle: null,
        isWebHandle: false,
      };
    }
    return {
      path: tauriPath,
      handle: null,
      isWebHandle: false,
    };
  }
  // In web, use the registered filename
  if (!handle) {
    throw new Error('Web environment requires a valid FileSystemFileHandle');
  }
  return {
    path: fallbackName,
    handle,
    isWebHandle: true,
  };
}

/**
 * Get file content as a File object (for web) or null (for Tauri)
 */
export async function getFileContent(handle: FileSystemFileHandle | null): Promise<File | null> {
  if (isTauriEnvironment()) {
    // In Tauri, we don't need File objects as DuckDB can read directly from paths
    return null;
  }
  if (handle) {
    // In web, get the File object from the handle
    return await handle.getFile();
  }
  throw new Error('Web environment requires a valid FileSystemFileHandle');
}

/**
 * Check if we need to register a file with DuckDB
 */
export function needsFileRegistration(): boolean {
  // Only web environment needs file registration
  return !isTauriEnvironment();
}

/**
 * Compare two file handles for equality
 */
export async function isSameFile(
  entry1: { handle: FileSystemFileHandle | FileSystemDirectoryHandle | null },
  entry2: { handle: FileSystemFileHandle | FileSystemDirectoryHandle | null },
): Promise<boolean> {
  if (isTauriEnvironment()) {
    // In Tauri, compare paths
    const path1 = (entry1.handle as any)?._tauriPath;
    const path2 = (entry2.handle as any)?._tauriPath;
    return !!(path1 && path2 && path1 === path2);
  }
  // In web, use isSameEntry
  if (entry1.handle && entry2.handle) {
    return await entry1.handle.isSameEntry(entry2.handle);
  }
  return false;
}
