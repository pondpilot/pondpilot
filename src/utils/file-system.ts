import {
  CodeFileExt,
  codeFileExts,
  SUPPORTED_DATA_SOURCE_FILE_EXTS,
  CORE_DATA_SOURCE_FILE_EXTS,
  LocalEntry,
  LocalEntryId,
  LocalFile,
  LocalFolder,
  supportedDataSourceFileExt,
} from '@models/file-system';

import { isTauriEnvironment } from './browser';
import {
  UnifiedFileHandle,
  UnifiedDirectoryHandle,
  UnifiedHandle,
  convertLegacyHandle,
} from './file-handle';
import { makeIdFactory } from './new-id';

export const makeLocalEntryId = makeIdFactory<LocalEntryId>();

export function isSupportedDataSourceFileExt(x: unknown): x is supportedDataSourceFileExt {
  // In web version, only allow core extensions
  if (!isTauriEnvironment()) {
    return CORE_DATA_SOURCE_FILE_EXTS.includes(x as any);
  }
  // In Tauri, allow all extensions
  return SUPPORTED_DATA_SOURCE_FILE_EXTS.includes(x as supportedDataSourceFileExt);
}

export function isCodeFileExt(x: unknown): x is CodeFileExt {
  return codeFileExts.includes(x as CodeFileExt);
}

export async function collectFileHandlePersmissions(handles: FileSystemHandle[]): Promise<{
  errorHandles: { handle: FileSystemHandle; reason: any }[];
  grantedHandles: FileSystemHandle[];
  deniedHandles: FileSystemHandle[];
  promptHandles: FileSystemHandle[];
}> {
  const results = await Promise.allSettled(
    handles.map(async (handle) => ({
      handle,
      permission: await handle.queryPermission(),
    })),
  );

  const errorHandles = Array.from(results.entries())
    .map(([idx, result]) =>
      result.status === 'rejected' ? { handle: handles[idx], reason: result.reason } : null,
    )
    .filter((res) => res !== null);

  const checkedHandles = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  const grantedHandles = checkedHandles
    .filter((result) => result.permission === 'granted')
    .map((result) => result.handle);
  const deniedHandles = checkedHandles
    .filter((result) => result.permission === 'denied')
    .map((result) => result.handle);
  const promptHandles = checkedHandles
    .filter((result) => result.permission === 'prompt')
    .map((result) => result.handle);

  return {
    errorHandles,
    grantedHandles,
    deniedHandles,
    promptHandles,
  };
}

export async function requestFileHandlePersmissions(handles: FileSystemHandle[]): Promise<{
  errorHandles: { handle: FileSystemHandle; reason: any }[];
  grantedHandles: FileSystemHandle[];
  deniedHandles: FileSystemHandle[];
}> {
  const results = await Promise.allSettled(
    handles.map(async (handle) => ({
      handle,
      permission: await handle.requestPermission(),
    })),
  );

  const errorHandles = Array.from(results.entries())
    .map(([idx, result]) =>
      result.status === 'rejected' ? { handle: handles[idx], reason: result.reason } : null,
    )
    .filter((res) => res !== null);

  const checkedHandles = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  const grantedHandles = checkedHandles
    .filter((result) => result.permission === 'granted')
    .map((result) => result.handle);
  const deniedHandles = checkedHandles
    .filter((result) => result.permission !== 'granted')
    .map((result) => result.handle);

  return {
    errorHandles,
    grantedHandles,
    deniedHandles,
  };
}

export async function isAvailableFileHandle(handle: FileSystemHandle): Promise<boolean> {
  if (handle.kind === 'directory') {
    try {
      await (handle as FileSystemDirectoryHandle).entries().next();
      return true;
    } catch (e) {
      return false;
    }
  }

  try {
    await (handle as FileSystemFileHandle).getFile();
    return true;
  } catch (e) {
    return false;
  }
}

// Overload signatures:
export function localEntryFromHandle(
  handle: FileSystemFileHandle | UnifiedFileHandle,
  parentId: LocalEntryId | null,
  userAdded: boolean,
  getUniqueAlias: (name: string) => string,
): LocalFile | null;
export function localEntryFromHandle(
  handle: FileSystemDirectoryHandle | UnifiedDirectoryHandle,
  parentId: LocalEntryId | null,
  userAdded: boolean,
  getUniqueAlias: (name: string) => string,
): LocalFolder;
export function localEntryFromHandle(
  handle: FileSystemFileHandle | FileSystemDirectoryHandle | UnifiedHandle,
  parentId: LocalEntryId | null,
  userAdded: boolean,
  getUniqueAlias: (name: string) => string,
): LocalEntry | null;

// Implementation:
export function localEntryFromHandle(
  handle: FileSystemFileHandle | FileSystemDirectoryHandle | UnifiedHandle,
  parentId: LocalEntryId | null,
  userAdded: boolean,
  getUniqueAlias: (name: string) => string,
): LocalEntry | null {
  // Convert legacy handles to unified handles
  let unifiedHandle: UnifiedHandle | null = null;

  if ('_tauriPath' in handle) {
    unifiedHandle = convertLegacyHandle(handle);
  } else if ('getNativeHandle' in handle) {
    unifiedHandle = handle as UnifiedHandle;
  } else if (handle.kind === 'file') {
    // It's a native FileSystemHandle
    unifiedHandle = convertLegacyHandle(handle);
  } else {
    unifiedHandle = convertLegacyHandle(handle);
  }

  if (!unifiedHandle) return null;

  if (unifiedHandle.kind === 'file') {
    const fileName = unifiedHandle.name;
    const [name, ext] = fileName.split(/\.(?=[^.]+$)/);

    if (!ext) {
      return null;
    }

    // Ensure we have a proper FileSystemFileHandle
    let fileHandle: FileSystemFileHandle;
    const nativeHandle = unifiedHandle.getNativeHandle();

    if (nativeHandle) {
      fileHandle = nativeHandle;
    } else if (handle && 'getFile' in handle && handle.kind === 'file') {
      fileHandle = handle as FileSystemFileHandle;
    } else {
      // This should not happen, but as a safety measure
      return null;
    }

    const commonFile = {
      kind: 'file' as const,
      id: makeLocalEntryId(),
      name,
      parentId,
      userAdded,
      handle: fileHandle,
      uniqueAlias: getUniqueAlias(name),
      filePath: unifiedHandle.getPath() || undefined,
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

  // Ensure we have a proper FileSystemDirectoryHandle
  let dirHandle: FileSystemDirectoryHandle;
  const nativeHandle = unifiedHandle.getNativeHandle();

  if (nativeHandle) {
    dirHandle = nativeHandle;
  } else if (handle && 'getDirectoryHandle' in handle && handle.kind === 'directory') {
    dirHandle = handle as FileSystemDirectoryHandle;
  } else {
    // This should not happen, but as a safety measure
    throw new Error('Invalid directory handle');
  }

  return {
    kind: 'directory' as const,
    id: makeLocalEntryId(),
    name: unifiedHandle.name,
    parentId,
    userAdded,
    handle: dirHandle,
    uniqueAlias: getUniqueAlias(unifiedHandle.name),
    directoryPath: unifiedHandle.getPath() || undefined,
  };
}

/**
 * Platform-agnostic file picker functions.
 * These automatically use the appropriate implementation based on the environment.
 */
// File picker functions (pickFiles, pickFolder) are now in file-picker-utils.ts
