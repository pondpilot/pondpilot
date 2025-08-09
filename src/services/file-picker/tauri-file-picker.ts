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
  private dialogModule: any = null;
  private initPromise: Promise<void> | null = null;

  supports = {
    multiple: true,
    directories: true,
    saveFile: true,
    fileSystemAccess: false, // Tauri doesn't use web File System Access API
    dragAndDrop: true,
  };

  constructor() {
    this.initPromise = this.initializeDialog();
  }

  private async initializeDialog() {
    try {
      // Import the entire dialog module
      this.dialogModule = await import('@tauri-apps/plugin-dialog');
      // console.log('Tauri dialog module loaded:', this.dialogModule);
    } catch (error) {
      // console.error('Failed to load Tauri dialog API:', error);
    }
  }

  private async ensureInitialized() {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  async pickFiles(options: FilePickerOptions = {}): Promise<FilePickerResult> {
    // console.log('TauriFilePicker.pickFiles called with options:', options);

    await this.ensureInitialized();

    if (!this.dialogModule) {
      // console.error('Tauri dialog module not available after initialization');
      return {
        files: [],
        error: 'Tauri dialog API not available',
        cancelled: false,
      };
    }

    const { accept = [], description = 'Files', multiple = true } = options;

    try {
      // Convert extensions to Tauri format
      const filters =
        accept.length > 0
          ? [
              {
                name: description,
                extensions: accept.map((ext) => (ext.startsWith('.') ? ext.slice(1) : ext)),
              },
            ]
          : undefined;

      // console.log('Calling dialog.open with:', { multiple, filters, directory: false });
      const result = await this.dialogModule.open({
        multiple,
        filters,
        directory: false,
      });
      // console.log('Dialog result:', result);

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
      // console.error('Error calling dialog.open:', error);
      return {
        files: [],
        error: error.message || 'Failed to pick files',
        cancelled: false,
      };
    }
  }

  async pickDirectory(_options: FilePickerOptions = {}): Promise<DirectoryPickerResult> {
    await this.ensureInitialized();

    if (!this.dialogModule) {
      return {
        directory: null,
        error: 'Tauri dialog API not available',
        cancelled: false,
      };
    }

    try {
      const result = await this.dialogModule.open({
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
    await this.ensureInitialized();

    if (!this.dialogModule) {
      return {
        file: null,
        error: 'Tauri dialog API not available',
        cancelled: false,
      };
    }

    const { suggestedName, accept = {}, description = 'Save file' } = options;

    try {
      // Convert accept object to Tauri filters format
      const filters =
        Object.keys(accept).length > 0
          ? Object.entries(accept).map(([desc, extensions]) => ({
              name: desc || description,
              extensions: extensions.map((ext) => (ext.startsWith('.') ? ext.slice(1) : ext)),
            }))
          : undefined;

      const result = await this.dialogModule.save({
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
