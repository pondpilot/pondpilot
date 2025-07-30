import {
  CodeFileExt,
  codeFileExts,
  SUPPORTED_DATA_SOURCE_FILE_EXTS,
  LocalEntry,
  LocalEntryId,
  LocalFile,
  LocalFolder,
  supportedDataSourceFileExt,
} from '@models/file-system';

import { makeIdFactory } from './new-id';

export const makeLocalEntryId = makeIdFactory<LocalEntryId>();

export function isSupportedDataSourceFileExt(x: unknown): x is supportedDataSourceFileExt {
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
  handle: FileSystemFileHandle,
  parentId: LocalEntryId | null,
  userAdded: boolean,
  getUniqueAlias: (name: string) => string,
): LocalFile | null;
export function localEntryFromHandle(
  handle: FileSystemDirectoryHandle,
  parentId: LocalEntryId | null,
  userAdded: boolean,
  getUniqueAlias: (name: string) => string,
): LocalFolder;
export function localEntryFromHandle(
  handle: FileSystemFileHandle | FileSystemDirectoryHandle,
  parentId: LocalEntryId | null,
  userAdded: boolean,
  getUniqueAlias: (name: string) => string,
): LocalEntry | null;

// Implementation:
export function localEntryFromHandle(
  handle: FileSystemFileHandle | FileSystemDirectoryHandle,
  parentId: LocalEntryId | null,
  userAdded: boolean,
  getUniqueAlias: (name: string) => string,
): LocalEntry | null {
  if (handle.kind === 'file') {
    const fileName = handle.name;
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
      handle,
      uniqueAlias: getUniqueAlias(name),
      // Add Tauri path support
      filePath: (handle as any)._tauriPath,
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

  return {
    kind: 'directory' as const,
    id: makeLocalEntryId(),
    name: handle.name,
    parentId,
    userAdded,
    handle,
    uniqueAlias: getUniqueAlias(handle.name),
    // Add Tauri path support
    directoryPath: (handle as any)._tauriPath,
  };
}

/**
 * Platform-agnostic file picker functions.
 * These automatically use the appropriate implementation based on the environment.
 */
export { pickFiles, pickFolder } from './file-system-new';
