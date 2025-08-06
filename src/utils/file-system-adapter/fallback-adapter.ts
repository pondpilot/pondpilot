/**
 * Fallback adapter for browsers without File System Access API (Firefox, Safari)
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

export class FallbackFileSystemAdapter implements FileSystemAdapter {
  private fileInputElement: HTMLInputElement | null = null;

  getBrowserCapabilities(): BrowserCapabilities {
    const hasWebkitDirectory = 'webkitdirectory' in HTMLInputElement.prototype;

    return {
      // File system features
      hasNativeFileSystemAccess: false,
      hasFallbackFileAccess: true,
      canPickFiles: true,
      canPickMultipleFiles: true,
      canPickDirectories: hasWebkitDirectory,
      canPersistFileHandles: false,
      canWriteToFiles: false,

      // Storage features
      hasOPFS: 'storage' in navigator && 'getDirectory' in navigator.storage,
      hasIndexedDB: 'indexedDB' in window,

      // Input features
      hasWebkitDirectory,
      hasDragAndDrop: true,
      hasDragAndDropDirectory: false, // Limited support in fallback mode
    };
  }

  getBrowserInfo(): BrowserInfo {
    const ua = navigator.userAgent;
    let name = 'Unknown';
    let version = '';

    if (ua.includes('Firefox/')) {
      name = 'Firefox';
      version = ua.match(/Firefox\/(\d+)/)?.[1] || '';
    } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
      name = 'Safari';
      version = ua.match(/Version\/(\d+)/)?.[1] || '';
    }

    const capabilities = this.getBrowserCapabilities();

    const limitations = [
      'Files must be re-selected each session',
      'Large files are copied to browser memory',
      'Cannot save changes back to original files',
    ];

    if (!capabilities.canPickDirectories) {
      limitations.push('Folder selection is not supported');
    } else {
      limitations.push('Limited folder browsing (flat structure only)');
    }

    const recommendations = [
      'For the best experience with PondPilot, we recommend using Google Chrome or Microsoft Edge.',
      `${name} users can still use PondPilot, but some features like persistent file access are limited.`,
    ];

    return {
      name,
      version,
      capabilities,
      level: capabilities.canPickDirectories ? 'basic' : 'limited',
      limitations,
      recommendations,
    };
  }

  canPersistHandles(): boolean {
    return false;
  }

  canAccessDirectories(): boolean {
    return 'webkitdirectory' in HTMLInputElement.prototype;
  }

  canWriteBack(): boolean {
    return false;
  }

  async pickFiles(options?: FilePickerOptions): Promise<FilePickerResult> {
    return new Promise((resolve) => {
      // Clean up any existing input element
      if (this.fileInputElement) {
        this.fileInputElement.remove();
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.style.display = 'none';

      if (options?.multiple !== false) {
        input.multiple = true;
      }

      if (options?.accept) {
        // Convert accept object to comma-separated string
        const acceptTypes: string[] = [];
        for (const [_mimeType, extensions] of Object.entries(options.accept)) {
          // Ensure extensions start with a dot
          const normalizedExtensions = extensions.map((ext) =>
            ext.startsWith('.') ? ext : `.${ext}`,
          );
          acceptTypes.push(...normalizedExtensions);
        }
        input.accept = acceptTypes.join(',');
      }

      input.addEventListener('change', () => {
        const files = Array.from(input.files || []);

        if (files.length === 0) {
          resolve({
            success: false,
            error: 'No files selected',
            userCancelled: true,
          });
        } else {
          resolve({
            success: true,
            type: 'fallback',
            files,
          });
        }

        input.remove();
        this.fileInputElement = null;
      });

      // Handle cancel event (not all browsers support this)
      input.addEventListener('cancel', () => {
        resolve({
          success: false,
          error: 'User cancelled file selection',
          userCancelled: true,
        });
        input.remove();
        this.fileInputElement = null;
      });

      document.body.appendChild(input);
      this.fileInputElement = input;
      input.click();
    });
  }

  async pickFilesLegacy(options?: FilePickerOptions): Promise<FileHandle[]> {
    const result = await this.pickFiles(options);

    if (!result.success) {
      return [];
    }

    if (result.type === 'fallback') {
      return result.files.map((file) => ({
        kind: 'file' as const,
        name: file.name,
        getFile: async () => file,
      }));
    }

    // This shouldn't happen in fallback adapter
    return [];
  }

  async pickDirectory(_options?: DirectoryPickerOptions): Promise<DirectoryPickerResult> {
    if (!this.canAccessDirectories()) {
      return {
        success: false,
        error: 'Directory selection is not supported in this browser',
      };
    }

    return new Promise((resolve) => {
      // Clean up any existing input element
      if (this.fileInputElement) {
        this.fileInputElement.remove();
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.style.display = 'none';

      // Use webkitdirectory for folder selection
      input.webkitdirectory = true;
      input.directory = true;

      input.addEventListener('change', () => {
        const files = Array.from(input.files || []);

        if (files.length === 0) {
          resolve({
            success: false,
            error: 'No folder selected',
            userCancelled: true,
          });
          input.remove();
          this.fileInputElement = null;
          return;
        }

        // In fallback mode, we return all files from the directory
        resolve({
          success: true,
          type: 'fallback',
          files,
        });

        input.remove();
        this.fileInputElement = null;
      });

      input.addEventListener('cancel', () => {
        resolve({
          success: false,
          error: 'User cancelled directory selection',
          userCancelled: true,
        });
        input.remove();
        this.fileInputElement = null;
      });

      document.body.appendChild(input);
      this.fileInputElement = input;
      input.click();
    });
  }

  async pickDirectoryLegacy(options?: DirectoryPickerOptions): Promise<DirectoryHandle | null> {
    const result = await this.pickDirectory(options);

    if (!result.success) {
      return null;
    }

    if (result.type === 'fallback') {
      // Extract directory name from the first file's path
      const firstFile = result.files[0];
      const pathParts = firstFile.webkitRelativePath?.split('/') || [];
      const directoryName = pathParts[0] || 'folder';

      // Group files by their directory structure
      const filesByPath = new Map<string, File[]>();

      for (const file of result.files) {
        const relativePath = file.webkitRelativePath || file.name;
        const parts = relativePath.split('/');

        // Skip the root directory name
        const subPath = parts.slice(1, -1).join('/');

        if (!filesByPath.has(subPath)) {
          filesByPath.set(subPath, []);
        }
        filesByPath.get(subPath)!.push(file);
      }

      // Create entries function that yields files from the root level
      const entries = async function* entriesGenerator(): AsyncIterable<
        [string, FileHandle | DirectoryHandle]
      > {
        // Only yield files at the root level (empty subPath)
        const rootFiles = filesByPath.get('') || [];

        for (const file of rootFiles) {
          yield [
            file.name,
            {
              kind: 'file' as const,
              name: file.name,
              getFile: async () => file,
            },
          ];
        }

        // For subdirectories, we'll create directory handles
        const subdirs = new Set<string>();

        for (const [path] of filesByPath) {
          if (path !== '') {
            const firstDir = path.split('/')[0];
            subdirs.add(firstDir);
          }
        }

        for (const subdir of subdirs) {
          yield [
            subdir,
            {
              kind: 'directory' as const,
              name: subdir,
            },
          ];
        }
      };

      return {
        kind: 'directory',
        name: directoryName,
        entries,
      };
    }

    // This shouldn't happen in fallback adapter
    return null;
  }

  async requestPermission(_handle: FileHandle | DirectoryHandle): Promise<boolean> {
    // Fallback adapter doesn't need permissions
    return true;
  }

  async queryPermission(_handle: FileHandle | DirectoryHandle): Promise<PermissionState> {
    // Fallback adapter always has permission for its own handles
    return 'granted';
  }
}
