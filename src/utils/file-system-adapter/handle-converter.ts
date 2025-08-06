/**
 * Utilities to convert between adapter handles and native FileSystemHandle
 */

import { FileHandle, DirectoryHandle } from './models';

/**
 * Convert adapter FileHandle to native FileSystemFileHandle if available
 * Otherwise create a mock handle that satisfies the interface
 */
export async function toFileSystemFileHandle(
  handle: FileHandle,
): Promise<FileSystemFileHandle | null> {
  // If we have a native handle, return it
  if (handle.nativeHandle) {
    return handle.nativeHandle;
  }

  // For fallback mode, we can't create a real FileSystemFileHandle
  // The consuming code needs to be updated to handle this case
  return null;
}

/**
 * Convert adapter DirectoryHandle to native FileSystemDirectoryHandle if available
 */
export async function toFileSystemDirectoryHandle(
  handle: DirectoryHandle,
): Promise<FileSystemDirectoryHandle | null> {
  // If we have a native handle, return it
  if (handle.nativeHandle) {
    return handle.nativeHandle;
  }

  // For fallback mode, we can't create a real FileSystemDirectoryHandle
  return null;
}

/**
 * Create a compatibility wrapper that provides FileSystemFileHandle-like interface
 * for fallback mode. This is used when we need to pass something to existing code
 * that expects FileSystemFileHandle but we're in fallback mode.
 */
export function createFileHandleWrapper(handle: FileHandle): FileSystemFileHandle {
  if (handle.nativeHandle) {
    return handle.nativeHandle;
  }

  // Create a mock object that implements the minimum required interface
  // Note: This is a partial implementation focused on read operations
  const wrapper = {
    kind: 'file' as const,
    name: handle.name,
    async getFile() {
      return handle.getFile();
    },
    async isSameEntry(_other: FileSystemHandle) {
      // In fallback mode, we can't properly compare handles
      return false;
    },
    async queryPermission() {
      return 'granted' as PermissionState;
    },
    async requestPermission() {
      return 'granted' as PermissionState;
    },
    // These methods are not supported in fallback mode
    async createWritable() {
      throw new Error('Writing files is not supported in this browser');
    },
    async createSyncAccessHandle() {
      throw new Error('Sync access is not supported in this browser');
    },
  };

  return wrapper as unknown as FileSystemFileHandle;
}

/**
 * Create a compatibility wrapper for DirectoryHandle
 */
export function createDirectoryHandleWrapper(handle: DirectoryHandle): FileSystemDirectoryHandle {
  if (handle.nativeHandle) {
    return handle.nativeHandle;
  }

  // Create a mock object that implements the minimum required interface
  const wrapper = {
    kind: 'directory' as const,
    name: handle.name,
    async isSameEntry(_other: FileSystemHandle) {
      return false;
    },
    async queryPermission() {
      return 'granted' as PermissionState;
    },
    async requestPermission() {
      return 'granted' as PermissionState;
    },
    // Provide entries if available from the adapter
    async *entries() {
      if (handle.entries) {
        for await (const [name, subHandle] of handle.entries()) {
          if (subHandle.kind === 'file') {
            yield [name, createFileHandleWrapper(subHandle)] as [string, FileSystemFileHandle];
          } else {
            yield [name, createDirectoryHandleWrapper(subHandle)] as [
              string,
              FileSystemDirectoryHandle,
            ];
          }
        }
      }
    },
    async *values() {
      if (handle.entries) {
        for await (const [_, subHandle] of handle.entries()) {
          if (subHandle.kind === 'file') {
            yield createFileHandleWrapper(subHandle);
          } else {
            yield createDirectoryHandleWrapper(subHandle);
          }
        }
      }
    },
    async *keys() {
      if (handle.entries) {
        for await (const [name] of handle.entries()) {
          yield name;
        }
      }
    },
    // These methods are not fully supported in fallback mode
    async getFileHandle(_name: string, _options?: FileSystemGetFileOptions) {
      throw new Error('Getting file handles is not supported in this browser');
    },
    async getDirectoryHandle(_name: string, _options?: FileSystemGetDirectoryOptions) {
      throw new Error('Getting directory handles is not supported in this browser');
    },
    async removeEntry(_name: string, _options?: FileSystemRemoveOptions) {
      throw new Error('Removing entries is not supported in this browser');
    },
    async resolve(_possibleChild: FileSystemHandle) {
      return null;
    },
  };

  // Add Symbol.asyncIterator to make it iterable
  (wrapper as any)[Symbol.asyncIterator] = wrapper.entries;

  return wrapper as unknown as FileSystemDirectoryHandle;
}
