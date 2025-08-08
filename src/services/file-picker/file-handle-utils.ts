import { isTauriEnvironment } from '@utils/browser';
import { convertLegacyHandle } from '@utils/file-handle';

/**
 * Check if a file handle is from Tauri environment
 */
export function isTauriFileHandle(handle: FileSystemHandle): boolean {
  if (!isTauriEnvironment()) return false;

  // Check if it's a unified handle that has a path
  const unified = convertLegacyHandle(handle);
  return unified?.getPath() !== null;
}

/**
 * Get the file path from a Tauri file handle
 */
export function getTauriFilePath(handle: FileSystemFileHandle): string | undefined {
  const unified = convertLegacyHandle(handle);
  return unified?.getPath() || undefined;
}

/**
 * Get the directory path from a Tauri directory handle
 */
export function getTauriDirectoryPath(handle: FileSystemDirectoryHandle): string | undefined {
  const unified = convertLegacyHandle(handle);
  return unified?.getPath() || undefined;
}

/**
 * Check if writable streams are supported for a file handle
 */
export function supportsWritableStream(handle: FileSystemFileHandle): boolean {
  return !isTauriEnvironment() && 'createWritable' in handle;
}

/**
 * Check if permission requests are supported
 */
export function supportsPermissionRequest(handle: FileSystemHandle): boolean {
  return !isTauriEnvironment() && 'requestPermission' in handle;
}

/**
 * Check if directory iteration is supported
 */
export function supportsDirectoryIteration(handle: FileSystemDirectoryHandle): boolean {
  return !isTauriEnvironment() && 'entries' in handle;
}

/**
 * Safely get a file from a handle (works in both environments)
 */
export async function getFileFromHandle(handle: FileSystemFileHandle): Promise<File> {
  return handle.getFile();
}

/**
 * Get a safe identifier for a file handle (works in both environments)
 */
export function getFileHandleId(handle: FileSystemFileHandle): string {
  if (isTauriFileHandle(handle)) {
    return getTauriFilePath(handle) || handle.name;
  }
  // In web environment, use the name as identifier
  // Note: This is not guaranteed to be unique
  return handle.name;
}

/**
 * Check if two file handles refer to the same file
 */
export async function isSameFileHandle(
  handle1: FileSystemFileHandle,
  handle2: FileSystemFileHandle,
): Promise<boolean> {
  // In Tauri, compare paths
  if (isTauriFileHandle(handle1) && isTauriFileHandle(handle2)) {
    const path1 = getTauriFilePath(handle1);
    const path2 = getTauriFilePath(handle2);
    return path1 === path2 && path1 !== undefined;
  }

  // In web, use the isSameEntry API if available
  if (!isTauriEnvironment() && 'isSameEntry' in handle1) {
    return handle1.isSameEntry(handle2);
  }

  // Fallback: compare names (not reliable)
  return handle1.name === handle2.name;
}

/**
 * Get display name for a file handle
 */
export function getFileHandleDisplayName(handle: FileSystemFileHandle): string {
  const tauriPath = getTauriFilePath(handle);
  if (tauriPath) {
    // Return full path for Tauri handles
    return tauriPath;
  }
  // Return just the name for web handles
  return handle.name;
}
