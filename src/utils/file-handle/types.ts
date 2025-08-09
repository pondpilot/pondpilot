export interface UnifiedFileHandle {
  readonly kind: 'file';
  readonly name: string;

  getFile: () => Promise<File>;
  queryPermission: () => Promise<PermissionState>;
  requestPermission: () => Promise<PermissionState>;

  getNativeHandle: () => FileSystemFileHandle | null;
  getPath: () => string | null;

  isSameEntry: (other: UnifiedFileHandle) => Promise<boolean>;
}

export interface UnifiedDirectoryHandle {
  readonly kind: 'directory';
  readonly name: string;

  entries: () => AsyncIterable<[string, UnifiedFileHandle | UnifiedDirectoryHandle]>;
  getFileHandle: (name: string, options?: FileSystemGetFileOptions) => Promise<UnifiedFileHandle>;
  getDirectoryHandle: (
    name: string,
    options?: FileSystemGetDirectoryOptions,
  ) => Promise<UnifiedDirectoryHandle>;

  queryPermission: () => Promise<PermissionState>;
  requestPermission: () => Promise<PermissionState>;

  getNativeHandle: () => FileSystemDirectoryHandle | null;
  getPath: () => string | null;

  isSameEntry: (other: UnifiedDirectoryHandle) => Promise<boolean>;
}

export type UnifiedHandle = UnifiedFileHandle | UnifiedDirectoryHandle;
