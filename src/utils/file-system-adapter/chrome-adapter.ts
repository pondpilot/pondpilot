/**
 * Chrome/Edge adapter using native File System Access API
 */

import {
  FileSystemAdapter,
  FilePickerOptions,
  DirectoryPickerOptions,
  FileHandle,
  DirectoryHandle,
  BrowserInfo,
  BrowserCapabilities,
  FilePickerResult,
  DirectoryPickerResult,
} from './models';

export class ChromeFileSystemAdapter implements FileSystemAdapter {
  private convertAcceptOptions(
    accept: Record<string, string[]>,
  ): Record<MIMEType, FileExtension[]> {
    const acceptConverted: Record<MIMEType, FileExtension[]> = {};
    for (const [mimeType, extensions] of Object.entries(accept)) {
      // Ensure extensions start with a dot
      const normalizedExtensions = extensions.map((ext) => (ext.startsWith('.') ? ext : `.${ext}`));
      acceptConverted[mimeType as MIMEType] = normalizedExtensions as FileExtension[];
    }
    return acceptConverted;
  }

  getBrowserCapabilities(): BrowserCapabilities {
    return {
      // File system features
      hasNativeFileSystemAccess: true,
      hasFallbackFileAccess: true,
      canPickFiles: true,
      canPickMultipleFiles: true,
      canPickDirectories: true,
      canPersistFileHandles: true,
      canWriteToFiles: true,

      // Storage features
      hasOPFS: 'storage' in navigator && 'getDirectory' in navigator.storage,
      hasIndexedDB: 'indexedDB' in window,

      // Input features
      hasWebkitDirectory: true,
      hasDragAndDrop: true,
      hasDragAndDropDirectory: true,
    };
  }

  getBrowserInfo(): BrowserInfo {
    const ua = navigator.userAgent;
    let name = 'Chrome';
    let version = '';

    // Check for Tauri first
    if (
      typeof window !== 'undefined' &&
      ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)
    ) {
      name = 'PondPilot Desktop';
      version = '';
    } else if (ua.includes('Edg/')) {
      name = 'Edge';
      version = ua.match(/Edg\/(\d+)/)?.[1] || '';
    } else if (ua.includes('Chrome/')) {
      version = ua.match(/Chrome\/(\d+)/)?.[1] || '';
    }

    const capabilities = this.getBrowserCapabilities();

    return {
      name,
      version,
      capabilities,
      level: 'full',
      limitations: [],
      recommendations: [],
    };
  }

  canPersistHandles(): boolean {
    return true;
  }

  canAccessDirectories(): boolean {
    return true;
  }

  canWriteBack(): boolean {
    return true;
  }

  async pickFiles(options?: FilePickerOptions): Promise<FilePickerResult> {
    try {
      const pickerOptions: OpenFilePickerOptions = {
        multiple: options?.multiple ?? true,
        excludeAcceptAllOption: options?.excludeAcceptAllOption ?? false,
      };

      if (options?.accept && options?.description) {
        pickerOptions.types = [
          {
            description: options.description,
            accept: this.convertAcceptOptions(options.accept),
          },
        ];
      }

      const handles = await window.showOpenFilePicker(pickerOptions);
      return {
        success: true,
        type: 'native',
        handles,
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'User cancelled file selection',
          userCancelled: true,
        };
      }
      return {
        success: false,
        error: error.message || 'Failed to pick files',
      };
    }
  }

  async pickFilesLegacy(options?: FilePickerOptions): Promise<FileHandle[]> {
    try {
      const pickerOptions: OpenFilePickerOptions = {
        multiple: options?.multiple ?? true,
        excludeAcceptAllOption: options?.excludeAcceptAllOption ?? false,
      };

      if (options?.accept && options?.description) {
        pickerOptions.types = [
          {
            description: options.description,
            accept: this.convertAcceptOptions(options.accept),
          },
        ];
      }

      const handles = await window.showOpenFilePicker(pickerOptions);

      return handles.map((handle) => ({
        kind: 'file' as const,
        name: handle.name,
        getFile: () => handle.getFile(),
        nativeHandle: handle,
      }));
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return [];
      }
      throw error;
    }
  }

  async pickDirectory(options?: DirectoryPickerOptions): Promise<DirectoryPickerResult> {
    try {
      const handle = await window.showDirectoryPicker({
        mode: options?.mode ?? 'read',
      });

      return {
        success: true,
        type: 'native',
        handle,
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'User cancelled directory selection',
          userCancelled: true,
        };
      }
      return {
        success: false,
        error: error.message || 'Failed to pick directory',
      };
    }
  }

  async pickDirectoryLegacy(options?: DirectoryPickerOptions): Promise<DirectoryHandle | null> {
    try {
      const handle = await window.showDirectoryPicker({
        mode: options?.mode ?? 'read',
      });

      // Create async iterator for entries
      const entries = async function* entriesGenerator(): AsyncIterable<
        [string, FileHandle | DirectoryHandle]
      > {
        for await (const [name, entryHandle] of handle.entries()) {
          if (entryHandle.kind === 'file') {
            yield [
              name,
              {
                kind: 'file',
                name: entryHandle.name,
                getFile: () => entryHandle.getFile(),
                nativeHandle: entryHandle,
              },
            ];
          } else {
            yield [
              name,
              {
                kind: 'directory',
                name: entryHandle.name,
                nativeHandle: entryHandle,
                async *entries() {
                  for await (const [subName, subHandle] of entryHandle.entries()) {
                    if (subHandle.kind === 'file') {
                      yield [
                        subName,
                        {
                          kind: 'file',
                          name: subHandle.name,
                          getFile: () => subHandle.getFile(),
                          nativeHandle: subHandle,
                        } as FileHandle,
                      ];
                    } else {
                      // For simplicity, we don't recursively wrap subdirectories
                      // The main code will handle recursion if needed
                      yield [
                        subName,
                        {
                          kind: 'directory',
                          name: subHandle.name,
                          nativeHandle: subHandle,
                        } as DirectoryHandle,
                      ];
                    }
                  }
                },
              },
            ];
          }
        }
      };

      return {
        kind: 'directory',
        name: handle.name,
        nativeHandle: handle,
        entries,
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return null;
      }
      throw error;
    }
  }

  async requestPermission(handle: FileHandle | DirectoryHandle): Promise<boolean> {
    if (!handle.nativeHandle) {
      return true; // No native handle means no permission needed
    }

    try {
      const permission = await handle.nativeHandle.requestPermission();
      return permission === 'granted';
    } catch {
      return false;
    }
  }

  async queryPermission(handle: FileHandle | DirectoryHandle): Promise<PermissionState> {
    if (!handle.nativeHandle) {
      return 'granted'; // No native handle means no permission needed
    }

    try {
      return await handle.nativeHandle.queryPermission();
    } catch {
      return 'denied';
    }
  }
}
