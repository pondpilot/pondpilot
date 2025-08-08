import { UnifiedFileHandle, UnifiedDirectoryHandle } from './types';

export class WebFileHandle implements UnifiedFileHandle {
  readonly kind = 'file' as const;

  constructor(private handle: FileSystemFileHandle) {}

  get name(): string {
    return this.handle.name;
  }

  async getFile(): Promise<File> {
    return this.handle.getFile();
  }

  async queryPermission(): Promise<PermissionState> {
    return this.handle.queryPermission();
  }

  async requestPermission(): Promise<PermissionState> {
    return this.handle.requestPermission();
  }

  getNativeHandle(): FileSystemFileHandle {
    return this.handle;
  }

  getPath(): string | null {
    return null;
  }

  async isSameEntry(other: UnifiedFileHandle): Promise<boolean> {
    const otherNative = other.getNativeHandle();
    if (!otherNative) return false;
    return this.handle.isSameEntry(otherNative);
  }
}

export class WebDirectoryHandle implements UnifiedDirectoryHandle {
  readonly kind = 'directory' as const;

  constructor(private handle: FileSystemDirectoryHandle) {}

  get name(): string {
    return this.handle.name;
  }

  async *entries(): AsyncIterable<[string, UnifiedFileHandle | UnifiedDirectoryHandle]> {
    for await (const [name, handle] of this.handle.entries()) {
      if (handle.kind === 'file') {
        yield [name, new WebFileHandle(handle)];
      } else {
        yield [name, new WebDirectoryHandle(handle)];
      }
    }
  }

  async getFileHandle(
    name: string,
    options?: FileSystemGetFileOptions,
  ): Promise<UnifiedFileHandle> {
    const handle = await this.handle.getFileHandle(name, options);
    return new WebFileHandle(handle);
  }

  async getDirectoryHandle(
    name: string,
    options?: FileSystemGetDirectoryOptions,
  ): Promise<UnifiedDirectoryHandle> {
    const handle = await this.handle.getDirectoryHandle(name, options);
    return new WebDirectoryHandle(handle);
  }

  async queryPermission(): Promise<PermissionState> {
    return this.handle.queryPermission();
  }

  async requestPermission(): Promise<PermissionState> {
    return this.handle.requestPermission();
  }

  getNativeHandle(): FileSystemDirectoryHandle {
    return this.handle;
  }

  getPath(): string | null {
    return null;
  }

  async isSameEntry(other: UnifiedDirectoryHandle): Promise<boolean> {
    const otherNative = other.getNativeHandle();
    if (!otherNative) return false;
    return this.handle.isSameEntry(otherNative);
  }
}
