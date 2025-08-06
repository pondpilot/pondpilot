/**
 * Cross-browser file system adapter types
 */

export type FilePickerOptions = {
  accept?: Record<string, string[]>;
  description?: string;
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
};

export type DirectoryPickerOptions = {
  mode?: 'read' | 'readwrite';
};

// Unified handle types with discriminated unions
export type AppFileHandle =
  | { type: 'native'; kind: 'file'; name: string; handle: FileSystemFileHandle }
  | { type: 'fallback'; kind: 'file'; name: string; file: File };

export type AppDirectoryHandle =
  | { type: 'native'; kind: 'directory'; name: string; handle: FileSystemDirectoryHandle }
  | { type: 'fallback'; kind: 'directory'; name: string; files: File[] };

export type AppHandle = AppFileHandle | AppDirectoryHandle;

// Legacy types for backward compatibility (will be phased out)
export type FileHandle = {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
  // Native handle if available (Chrome/Edge)
  nativeHandle?: FileSystemFileHandle;
};

export type DirectoryHandle = {
  kind: 'directory';
  name: string;
  // Native handle if available (Chrome/Edge)
  nativeHandle?: FileSystemDirectoryHandle;
  // For fallback implementations
  entries?: () => AsyncIterable<[string, FileHandle | DirectoryHandle]>;
};

// Granular browser capabilities
export type BrowserCapabilities = {
  // File system features
  hasNativeFileSystemAccess: boolean;
  hasFallbackFileAccess: boolean;
  canPickFiles: boolean;
  canPickMultipleFiles: boolean;
  canPickDirectories: boolean;
  canPersistFileHandles: boolean;
  canWriteToFiles: boolean;

  // Storage features
  hasOPFS: boolean;
  hasIndexedDB: boolean;

  // Input features
  hasWebkitDirectory: boolean;
  hasDragAndDrop: boolean;
  hasDragAndDropDirectory: boolean;
};

export type CompatibilityLevel = 'full' | 'basic' | 'limited';

export type BrowserInfo = {
  name: string;
  version: string;
  capabilities: BrowserCapabilities;
  level: CompatibilityLevel;
  limitations: string[];
  recommendations: string[];
};

// Result types for file picker operations
export type FilePickerResult =
  | { success: true; type: 'native'; handles: FileSystemFileHandle[] }
  | { success: true; type: 'fallback'; files: File[] }
  | { success: false; error: string; userCancelled?: boolean };

export type DirectoryPickerResult =
  | { success: true; type: 'native'; handle: FileSystemDirectoryHandle }
  | { success: true; type: 'fallback'; files: File[] }
  | { success: false; error: string; userCancelled?: boolean };

export interface FileSystemAdapter {
  // Capability detection
  getBrowserInfo: () => BrowserInfo;
  getBrowserCapabilities: () => BrowserCapabilities;
  canPersistHandles: () => boolean;
  canAccessDirectories: () => boolean;
  canWriteBack: () => boolean;

  // File operations (updated to use new result types)
  pickFiles: (options?: FilePickerOptions) => Promise<FilePickerResult>;
  pickDirectory: (options?: DirectoryPickerOptions) => Promise<DirectoryPickerResult>;

  // Legacy operations (for backward compatibility)
  pickFilesLegacy: (options?: FilePickerOptions) => Promise<FileHandle[]>;
  pickDirectoryLegacy: (options?: DirectoryPickerOptions) => Promise<DirectoryHandle | null>;

  // Permission handling
  requestPermission: (handle: FileHandle | DirectoryHandle) => Promise<boolean>;
  queryPermission: (handle: FileHandle | DirectoryHandle) => Promise<PermissionState>;
}

// Helper type guards
export function isFileHandle(handle: FileHandle | DirectoryHandle): handle is FileHandle {
  return handle.kind === 'file';
}

export function isDirectoryHandle(handle: FileHandle | DirectoryHandle): handle is DirectoryHandle {
  return handle.kind === 'directory';
}

// New type guards for App handles
export function isAppFileHandle(handle: AppHandle): handle is AppFileHandle {
  return handle.kind === 'file';
}

export function isAppDirectoryHandle(handle: AppHandle): handle is AppDirectoryHandle {
  return handle.kind === 'directory';
}

export function isNativeHandle(
  handle: AppHandle,
): handle is (AppFileHandle | AppDirectoryHandle) & { type: 'native' } {
  return handle.type === 'native';
}

export function isFallbackHandle(
  handle: AppHandle,
): handle is (AppFileHandle | AppDirectoryHandle) & { type: 'fallback' } {
  return handle.type === 'fallback';
}
