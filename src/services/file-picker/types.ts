/**
 * File picker interfaces for platform-agnostic file selection
 */

export interface FilePickerOptions {
  accept?: string[];
  description?: string;
  multiple?: boolean;
  directory?: boolean;
}

export interface SaveFileOptions {
  suggestedName?: string;
  accept?: Record<string, string[]>;
  description?: string;
}

export interface PickedFile {
  name: string;
  path?: string;
  handle?: FileSystemFileHandle;
  file?: File;
  size?: number;
  lastModified?: number;
  type?: string;
}

export interface PickedDirectory {
  name: string;
  path?: string;
  handle?: FileSystemDirectoryHandle;
}

export interface FilePickerResult<T = PickedFile> {
  files: T[];
  error: string | null;
  cancelled: boolean;
}

export interface DirectoryPickerResult {
  directory: PickedDirectory | null;
  error: string | null;
  cancelled: boolean;
}

export interface SaveFileResult {
  file: PickedFile | null;
  error: string | null;
  cancelled: boolean;
}

/**
 * Platform-agnostic file picker interface
 */
export interface IFilePicker {
  /**
   * Open file picker to select one or multiple files
   */
  pickFiles: (options?: FilePickerOptions) => Promise<FilePickerResult>;

  /**
   * Open directory picker to select a directory
   */
  pickDirectory: (options?: FilePickerOptions) => Promise<DirectoryPickerResult>;

  /**
   * Open save file dialog
   */
  saveFile: (options?: SaveFileOptions) => Promise<SaveFileResult>;

  /**
   * Check if the file picker supports certain features
   */
  supports: {
    multiple: boolean;
    directories: boolean;
    saveFile: boolean;
    fileSystemAccess: boolean;
    dragAndDrop: boolean;
  };
}
