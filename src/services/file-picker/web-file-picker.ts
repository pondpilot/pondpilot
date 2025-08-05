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
 * Web File Picker using File System Access API
 * Falls back to input element for browsers that don't support the API
 */
export class WebFilePicker implements IFilePicker {
  supports = {
    multiple: true,
    directories: 'showDirectoryPicker' in window,
    saveFile: 'showSaveFilePicker' in window,
    fileSystemAccess: 'showOpenFilePicker' in window,
    dragAndDrop: true,
  };

  async pickFiles(options: FilePickerOptions = {}): Promise<FilePickerResult> {
    const { accept = [], description = 'Files', multiple = true } = options;

    // Use File System Access API if available
    if (this.supports.fileSystemAccess) {
      return this.pickFilesWithFSA(accept, description, multiple);
    }

    // Fallback to input element
    return this.pickFilesWithInput(accept, multiple);
  }

  async pickDirectory(_options: FilePickerOptions = {}): Promise<DirectoryPickerResult> {
    if (!this.supports.directories) {
      return {
        directory: null,
        error: 'Directory picker not supported in this browser',
        cancelled: false,
      };
    }

    try {
      const handle = await window.showDirectoryPicker({
        mode: 'read',
      });

      return {
        directory: {
          name: handle.name,
          handle,
        },
        error: null,
        cancelled: false,
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return {
          directory: null,
          error: null,
          cancelled: true,
        };
      }

      return {
        directory: null,
        error: error.message || 'Failed to pick directory',
        cancelled: false,
      };
    }
  }

  async saveFile(options: SaveFileOptions = {}): Promise<SaveFileResult> {
    if (!this.supports.saveFile) {
      return {
        file: null,
        error: 'Save file dialog not supported in this browser',
        cancelled: false,
      };
    }

    const { suggestedName, accept = {}, description = 'Save file' } = options;

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types:
          Object.keys(accept).length > 0
            ? [
                {
                  description,
                  accept: accept as any,
                },
              ]
            : undefined,
      });

      return {
        file: {
          name: handle.name,
          handle,
        },
        error: null,
        cancelled: false,
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return {
          file: null,
          error: null,
          cancelled: true,
        };
      }

      return {
        file: null,
        error: error.message || 'Failed to save file',
        cancelled: false,
      };
    }
  }

  private async pickFilesWithFSA(
    accept: string[],
    description: string,
    multiple: boolean,
  ): Promise<FilePickerResult> {
    try {
      const handles = await window.showOpenFilePicker({
        types:
          accept.length > 0
            ? [
                {
                  description,
                  accept: {
                    'application/octet-stream': accept as any,
                  },
                },
              ]
            : undefined,
        excludeAcceptAllOption: false,
        multiple,
      });

      const files: PickedFile[] = [];
      for (const handle of handles) {
        const file = await handle.getFile();
        files.push({
          name: handle.name,
          handle,
          file,
          size: file.size,
          lastModified: file.lastModified,
          type: file.type,
        });
      }

      return {
        files,
        error: null,
        cancelled: false,
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return {
          files: [],
          error: null,
          cancelled: true,
        };
      }

      return {
        files: [],
        error: error.message || 'Failed to pick files',
        cancelled: false,
      };
    }
  }

  private async pickFilesWithInput(accept: string[], multiple: boolean): Promise<FilePickerResult> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = multiple;

      if (accept.length > 0) {
        input.accept = accept.join(',');
      }

      input.style.display = 'none';
      document.body.appendChild(input);

      const cleanup = () => {
        document.body.removeChild(input);
      };

      input.onchange = async () => {
        try {
          const files: PickedFile[] = [];

          if (input.files) {
            for (let i = 0; i < input.files.length; i += 1) {
              const file = input.files[i];
              files.push({
                name: file.name,
                file,
                size: file.size,
                lastModified: file.lastModified,
                type: file.type,
              });
            }
          }

          cleanup();
          resolve({
            files,
            error: null,
            cancelled: false,
          });
        } catch (error: any) {
          cleanup();
          resolve({
            files: [],
            error: error.message || 'Failed to process selected files',
            cancelled: false,
          });
        }
      };

      input.oncancel = () => {
        cleanup();
        resolve({
          files: [],
          error: null,
          cancelled: true,
        });
      };

      input.click();
    });
  }
}
