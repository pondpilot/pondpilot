import { UnifiedFileHandle, UnifiedDirectoryHandle } from './types';

export class TauriFileHandle implements UnifiedFileHandle {
  readonly kind = 'file' as const;

  constructor(
    private path: string,
    private fileName: string,
    private _lastModified?: number,
  ) {}

  get name(): string {
    return this.fileName;
  }

  async getFile(): Promise<File> {
    const fs = await import('@tauri-apps/plugin-fs');
    const contents = await fs.readFile(this.path);
    return new File([contents], this.name, {
      lastModified: this._lastModified || Date.now(),
    });
  }

  async queryPermission(): Promise<PermissionState> {
    return 'granted';
  }

  async requestPermission(): Promise<PermissionState> {
    return 'granted';
  }

  getNativeHandle(): FileSystemFileHandle | null {
    return null;
  }

  getPath(): string {
    return this.path;
  }

  async isSameEntry(other: UnifiedFileHandle): Promise<boolean> {
    const otherPath = other.getPath();
    if (!otherPath) return false;

    const path = await import('@tauri-apps/api/path');
    const normalizedThis = await path.normalize(this.path);
    const normalizedOther = await path.normalize(otherPath);

    return normalizedThis === normalizedOther;
  }
}

export class TauriDirectoryHandle implements UnifiedDirectoryHandle {
  readonly kind = 'directory' as const;

  constructor(
    private path: string,
    private dirName: string,
  ) {}

  get name(): string {
    return this.dirName;
  }

  async *entries(): AsyncIterable<[string, UnifiedFileHandle | UnifiedDirectoryHandle]> {
    const fs = await import('@tauri-apps/plugin-fs');
    const entries = await fs.readDir(this.path);

    for (const entry of entries) {
      if (entry.isFile) {
        yield [
          entry.name,
          new TauriFileHandle(await this.joinPath(this.path, entry.name), entry.name),
        ];
      } else if (entry.isDirectory) {
        yield [
          entry.name,
          new TauriDirectoryHandle(await this.joinPath(this.path, entry.name), entry.name),
        ];
      }
    }
  }

  async getFileHandle(
    name: string,
    options?: FileSystemGetFileOptions,
  ): Promise<UnifiedFileHandle> {
    const filePath = await this.joinPath(this.path, name);

    if (options?.create) {
      const fs = await import('@tauri-apps/plugin-fs');
      const exists = await fs.exists(filePath);
      if (!exists) {
        await fs.writeFile(filePath, new Uint8Array());
      }
    }

    return new TauriFileHandle(filePath, name);
  }

  async getDirectoryHandle(
    name: string,
    options?: FileSystemGetDirectoryOptions,
  ): Promise<UnifiedDirectoryHandle> {
    const dirPath = await this.joinPath(this.path, name);

    if (options?.create) {
      const fs = await import('@tauri-apps/plugin-fs');
      const exists = await fs.exists(dirPath);
      if (!exists) {
        await fs.mkdir(dirPath, { recursive: true });
      }
    }

    return new TauriDirectoryHandle(dirPath, name);
  }

  async queryPermission(): Promise<PermissionState> {
    return 'granted';
  }

  async requestPermission(): Promise<PermissionState> {
    return 'granted';
  }

  getNativeHandle(): FileSystemDirectoryHandle | null {
    return null;
  }

  getPath(): string {
    return this.path;
  }

  async isSameEntry(other: UnifiedDirectoryHandle): Promise<boolean> {
    const otherPath = other.getPath();
    if (!otherPath) return false;

    const path = await import('@tauri-apps/api/path');
    const normalizedThis = await path.normalize(this.path);
    const normalizedOther = await path.normalize(otherPath);

    return normalizedThis === normalizedOther;
  }

  private async joinPath(...parts: string[]): Promise<string> {
    const path = await import('@tauri-apps/api/path');
    return path.join(...parts);
  }
}
