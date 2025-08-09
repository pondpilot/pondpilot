import { isTauriEnvironment } from '@utils/browser';

import { TauriFileHandle, TauriDirectoryHandle } from './tauri-handles';
import { UnifiedFileHandle, UnifiedDirectoryHandle, UnifiedHandle } from './types';
import { WebFileHandle, WebDirectoryHandle } from './web-handles';

export function createUnifiedFileHandle(
  handleOrPath: FileSystemFileHandle | string,
  fileName?: string,
): UnifiedFileHandle {
  if (typeof handleOrPath === 'string') {
    if (!fileName) {
      const path = handleOrPath.split('/').pop() || 'unknown';
      fileName = path;
    }
    return new TauriFileHandle(handleOrPath, fileName);
  }

  return new WebFileHandle(handleOrPath);
}

export function createUnifiedDirectoryHandle(
  handleOrPath: FileSystemDirectoryHandle | string,
  dirName?: string,
): UnifiedDirectoryHandle {
  if (typeof handleOrPath === 'string') {
    if (!dirName) {
      const path = handleOrPath.split('/').filter(Boolean).pop() || 'unknown';
      dirName = path;
    }
    return new TauriDirectoryHandle(handleOrPath, dirName);
  }

  return new WebDirectoryHandle(handleOrPath);
}

export function isUnifiedFileHandle(handle: UnifiedHandle): handle is UnifiedFileHandle {
  return handle.kind === 'file';
}

export function isUnifiedDirectoryHandle(handle: UnifiedHandle): handle is UnifiedDirectoryHandle {
  return handle.kind === 'directory';
}

export function convertLegacyHandle(handle: any): UnifiedHandle | null {
  if (!handle) return null;

  // If this is a mock FileSystemHandle created from a unified handle,
  // it will carry a hidden reference to the original unified handle.
  // Prefer returning that so we preserve path information in Tauri.
  // We deliberately avoid adding a type for this hidden field.
  if (typeof handle === 'object' && handle && '__unifiedHandle' in (handle as any)) {
    return (handle as any).__unifiedHandle as UnifiedHandle;
  }

  if (handle.kind === 'file' && typeof handle.getFile === 'function') {
    return new WebFileHandle(handle as FileSystemFileHandle);
  }
  if (handle.kind === 'directory' && typeof handle.entries === 'function') {
    return new WebDirectoryHandle(handle as FileSystemDirectoryHandle);
  }

  return null;
}

export async function createFileHandleFromPath(path: string): Promise<UnifiedFileHandle> {
  if (isTauriEnvironment()) {
    const fileName = path.split('/').pop() || 'unknown';
    return new TauriFileHandle(path, fileName);
  }

  throw new Error('Cannot create file handle from path in web environment');
}

export async function createDirectoryHandleFromPath(path: string): Promise<UnifiedDirectoryHandle> {
  if (isTauriEnvironment()) {
    const dirName = path.split('/').filter(Boolean).pop() || 'unknown';
    return new TauriDirectoryHandle(path, dirName);
  }

  throw new Error('Cannot create directory handle from path in web environment');
}
