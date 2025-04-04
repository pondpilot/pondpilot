import {
  codeExtMap,
  CodeFileExt,
  codeFileExts,
  CodeMimeType,
  codeMimeTypes,
  dataSourceExtMap,
  DataSourceFileExt,
  dataSourceFileExts,
  DataSourceMimeType,
  dataSourceMimeTypes,
  LocalEntry,
  LocalEntryId,
  LocalFile,
  LocalFolder,
} from '@models/file-system';
import { v4 as uuidv4 } from 'uuid';

export function isDataSourceMimeType(x: unknown): x is DataSourceMimeType {
  return dataSourceMimeTypes.includes(x as DataSourceMimeType);
}

export function isDataSourceFileExt(x: unknown): x is DataSourceFileExt {
  return dataSourceFileExts.includes(x as DataSourceFileExt);
}

export function isCodeFileExt(x: unknown): x is CodeFileExt {
  return codeFileExts.includes(x as CodeFileExt);
}

export function isCodeMimeType(mimeType: unknown): mimeType is CodeMimeType {
  return codeMimeTypes.includes(mimeType as CodeMimeType);
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
    return true;
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
    const [_, ext] = fileName.split(/\.(?=[^.]+$)/);

    if (!ext) {
      return null;
    }
    const commonFile = {
      kind: 'file' as const,
      id: uuidv4() as LocalEntryId,
      name: handle.name,
      parentId,
      userAdded,
      handle,
      uniqueAlias: getUniqueAlias(handle.name),
    };
    const extLower = ext.toLowerCase();

    if (isDataSourceFileExt(extLower)) {
      return {
        ...commonFile,
        mimeType: dataSourceExtMap[extLower],
        fileType: 'data-source',
        ext: extLower,
      };
    }

    if (isCodeFileExt(extLower)) {
      return {
        ...commonFile,
        mimeType: codeExtMap[extLower],
        fileType: 'code-file',
        ext: extLower,
      };
    }

    return null;
  }

  return {
    kind: 'directory' as const,
    id: uuidv4() as LocalEntryId,
    name: handle.name,
    parentId,
    userAdded,
    handle,
  };
}
