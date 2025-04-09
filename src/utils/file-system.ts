import {
  CodeFileExt,
  codeFileExts,
  supportedDataSourceFileExts,
  LocalEntry,
  LocalEntryId,
  LocalFile,
  LocalFolder,
  supportedDataSourceFileExt,
} from '@models/file-system';
import { v4 as uuidv4 } from 'uuid';

export function isSupportedDataSourceFileExt(x: unknown): x is supportedDataSourceFileExt {
  return supportedDataSourceFileExts.includes(x as supportedDataSourceFileExt);
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
    const [name, ext] = fileName.split(/\.(?=[^.]+$)/);

    if (!ext) {
      return null;
    }
    const commonFile = {
      kind: 'file' as const,
      id: uuidv4() as LocalEntryId,
      name,
      parentId,
      userAdded,
      handle,
      uniqueAlias: getUniqueAlias(name),
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
    id: uuidv4() as LocalEntryId,
    name: handle.name,
    parentId,
    userAdded,
    handle,
  };
}

/**
 * A thin, non-throwring wrapper around `window.showOpenFilePicker` API.
 *
 * @param accept - Array of accepted file extensions.
 * @param description - Description of the file types (shown in the file picker).
 * @param allowMultiple - Whether to allow multiple file selection.
 * @returns - An object containing the selected file handles and an error flag.
 */
export const pickFiles = async (
  accept: FileExtension[],
  description: string,
  allowMultiple: boolean = true,
): Promise<{ handles: FileSystemFileHandle[]; error: string | null }> => {
  try {
    return {
      handles: await window.showOpenFilePicker({
        types: [
          {
            description,
            accept: {
              'application/octet-stream': accept,
            },
          },
        ],
        excludeAcceptAllOption: false,
        multiple: allowMultiple,
      }),
      error: null,
    };
  } catch (error: any) {
    return {
      handles: [],
      error: error.message ?? 'Unknown error',
    };
  }
};

/**
 * A thin, non-throwring wrapper around `window.showDirectoryPicker` API.
 *
 * @param accept - Array of accepted file extensions.
 * @param description - Description of the file types (shown in the file picker).
 * @param allowMultiple - Whether to allow multiple file selection.
 * @returns - An object containing the selected file handles and an error flag.
 */
export const pickFolder = async (): Promise<{
  handle: FileSystemDirectoryHandle | null;
  error: string | null;
}> => {
  try {
    return {
      handle: await window.showDirectoryPicker({
        mode: 'read',
      }),
      error: null,
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return {
        handle: null,
        error: null,
      };
    }

    return {
      handle: null,
      error: error.message ?? 'Unknown error',
    };
  }
};
