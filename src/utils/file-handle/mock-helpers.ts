/**
 * Helper functions for creating mock FileSystemHandle objects
 * These are used to maintain compatibility with the FileSystemHandle API
 * while using our unified handle system
 */

import { UnifiedFileHandle, UnifiedDirectoryHandle } from './types';

export function createMockFileSystemFileHandle(
  unifiedHandle: UnifiedFileHandle,
): FileSystemFileHandle {
  // Attach a hidden link to the unified handle so later conversion can recover it
  const handle: any = {
    kind: 'file',
    name: unifiedHandle.name,
    getFile: () => unifiedHandle.getFile(),
    queryPermission: () => unifiedHandle.queryPermission(),
    requestPermission: () => unifiedHandle.requestPermission(),
    createWritable: async () => {
      throw new Error('Write not supported in unified handle mode');
    },
    isSameEntry: async (other: FileSystemHandle) => {
      if (other.kind !== 'file') return false;
      return false;
    },
    isFile: true,
    isDirectory: false,
  };
  handle.__unifiedHandle = unifiedHandle;
  return handle as FileSystemFileHandle;
}

export function createMockFileSystemDirectoryHandle(
  unifiedHandle: UnifiedDirectoryHandle,
): FileSystemDirectoryHandle {
  const handle: any = {
    kind: 'directory' as const,
    name: unifiedHandle.name,
    async *entries() {
      for await (const [name, subHandle] of unifiedHandle.entries()) {
        if (subHandle.kind === 'file') {
          yield [name, createMockFileSystemFileHandle(subHandle)] as [string, FileSystemHandle];
        } else {
          yield [name, createMockFileSystemDirectoryHandle(subHandle)] as [
            string,
            FileSystemHandle,
          ];
        }
      }
    },
    async *keys() {
      for await (const [key] of unifiedHandle.entries()) {
        yield key;
      }
    },
    async *values() {
      for await (const [, subHandle] of unifiedHandle.entries()) {
        if (subHandle.kind === 'file') {
          yield createMockFileSystemFileHandle(subHandle) as FileSystemHandle;
        } else {
          yield createMockFileSystemDirectoryHandle(subHandle) as FileSystemHandle;
        }
      }
    },
    getDirectoryHandle: async (name: string, options?: FileSystemGetDirectoryOptions) => {
      const subHandle = await unifiedHandle.getDirectoryHandle(name, options);
      return createMockFileSystemDirectoryHandle(subHandle);
    },
    getFileHandle: async (name: string, options?: FileSystemGetFileOptions) => {
      const subHandle = await unifiedHandle.getFileHandle(name, options);
      return createMockFileSystemFileHandle(subHandle);
    },
    removeEntry: async () => {
      throw new Error('Remove not supported in unified handle mode');
    },
    resolve: async () => null,
    queryPermission: () => unifiedHandle.queryPermission(),
    requestPermission: () => unifiedHandle.requestPermission(),
    isSameEntry: async (other: FileSystemHandle) => {
      if (other.kind !== 'directory') return false;
      return false;
    },
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

  handle.__unifiedHandle = unifiedHandle;
  return handle as unknown as FileSystemDirectoryHandle;
}
