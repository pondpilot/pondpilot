import {
  IFilePicker,
  FilePickerOptions,
  SaveFileOptions,
  FilePickerResult,
  DirectoryPickerResult,
  SaveFileResult,
  PickedFile,
} from './types';

/**
 * Tauri Native File Picker using Tauri dialog API
 */
export class TauriFilePicker implements IFilePicker {
  private dialog: any = null;

  supports = {
    multiple: true,
    directories: true,
    saveFile: true,
    fileSystemAccess: false, // Tauri doesn't use web File System Access API
    dragAndDrop: true,
  };

  constructor() {
    this.initializeDialog();
  }

  private async initializeDialog() {
    try {
      const tauriApi = await import('@tauri-apps/api/dialog');
      this.dialog = tauriApi;
    } catch (error) {
      console.error('Failed to load Tauri dialog API:', error);
    }
  }

  async pickFiles(options: FilePickerOptions = {}): Promise<FilePickerResult> {
    if (!this.dialog) {
      await this.initializeDialog();
    }

    if (!this.dialog) {
      return {
        files: [],
        error: 'Tauri dialog API not available',
        cancelled: false,
      };
    }

    const { accept = [], description = 'Files', multiple = true } = options;

    try {
      // Convert extensions to Tauri format
      const filters = accept.length > 0 ? [{
        name: description,
        extensions: accept.map(ext => ext.startsWith('.') ? ext.slice(1) : ext),
      }] : undefined;

      const result = await this.dialog.open({
        multiple,
        filters,
        directory: false,
      });

      if (result === null) {
        return {
          files: [],
          error: null,
          cancelled: true,
        };
      }

      const paths = Array.isArray(result) ? result : [result];
      const files: PickedFile[] = [];

      for (const path of paths) {
        const name = path.split('/').pop() || path.split('\\').pop() || 'unknown';
        
        // For now, just add basic file info
        // TODO: Add file size/metadata when available in Tauri
        files.push({
          name,
          path,
        });
      }

      return {
        files,
        error: null,
        cancelled: false,
      };
    } catch (error: any) {
      return {
        files: [],
        error: error.message || 'Failed to pick files',
        cancelled: false,
      };
    }
  }

  async pickDirectory(options: FilePickerOptions = {}): Promise<DirectoryPickerResult> {
    if (!this.dialog) {
      await this.initializeDialog();
    }

    if (!this.dialog) {
      return {
        directory: null,
        error: 'Tauri dialog API not available',
        cancelled: false,
      };
    }

    try {
      const result = await this.dialog.open({
        multiple: false,
        directory: true,
      });

      if (result === null) {
        return {
          directory: null,
          error: null,
          cancelled: true,
        };
      }

      const path = result as string;
      const name = path.split('/').pop() || path.split('\\').pop() || 'unknown';

      return {
        directory: {
          name,
          path,
        },
        error: null,
        cancelled: false,
      };
    } catch (error: any) {
      return {
        directory: null,
        error: error.message || 'Failed to pick directory',
        cancelled: false,
      };
    }
  }

  async saveFile(options: SaveFileOptions = {}): Promise<SaveFileResult> {
    if (!this.dialog) {
      await this.initializeDialog();
    }

    if (!this.dialog) {
      return {
        file: null,
        error: 'Tauri dialog API not available',
        cancelled: false,
      };
    }

    const { suggestedName, accept = {}, description = 'Save file' } = options;

    try {
      // Convert accept object to Tauri filters format
      const filters = Object.keys(accept).length > 0 ? 
        Object.entries(accept).map(([desc, extensions]) => ({
          name: desc || description,
          extensions: extensions.map(ext => ext.startsWith('.') ? ext.slice(1) : ext),
        })) : undefined;

      const result = await this.dialog.save({
        defaultPath: suggestedName,
        filters,
      });

      if (result === null) {
        return {
          file: null,
          error: null,
          cancelled: true,
        };
      }

      const path = result as string;
      const name = path.split('/').pop() || path.split('\\').pop() || 'unknown';

      return {
        file: {
          name,
          path,
        },
        error: null,
        cancelled: false,
      };
    } catch (error: any) {
      return {
        file: null,
        error: error.message || 'Failed to save file',
        cancelled: false,
      };
    }
  }
}