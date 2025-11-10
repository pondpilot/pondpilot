/**
 * Validates if a path is safe to use with OPFS
 * Checks for path traversal attempts and invalid characters
 * @param opfsPath Path to validate, may include 'opfs://' prefix
 * @returns True if the path is safe, false otherwise
 */
export function isSafeOpfsPath(opfsPath: string): boolean {
  if (!opfsPath) return false;

  // Remove leading opfs:// or opfs: prefix
  let path = opfsPath;
  if (path.startsWith('opfs://')) {
    path = path.substring(7);
  } else if (path.startsWith('opfs:')) {
    path = path.substring(5);
  }

  // Remove leading slash if present
  if (path.startsWith('/')) {
    path = path.substring(1);
  }

  // Prevent empty paths after normalization
  if (path.length === 0) return false;

  // Check for path traversal attempts
  if (path.includes('..') || path.includes('//')) return false;

  // Check path segments
  const segments = path.split('/');
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];

    // Allow empty segment only at the end (trailing slash)
    if (segment === '' && i !== segments.length - 1) return false;

    // Only allow alphanumeric, underscore, dash, and dot in each segment
    if (segment !== '' && !/^[\w\-.]+$/.test(segment)) return false;
  }

  return true;
}

/**
 * Normalizes an OPFS path
 * Removes 'opfs://' prefix, leading slashes, and ensures consistent format
 * @param path Path to normalize
 * @returns Normalized path without 'opfs://' prefix
 */
export function normalizeOpfsPath(path: string): string {
  // Remove leading opfs:// or opfs: prefix
  let normalizedPath = path;
  if (normalizedPath.startsWith('opfs://')) {
    normalizedPath = normalizedPath.substring(7);
  } else if (normalizedPath.startsWith('opfs:')) {
    normalizedPath = normalizedPath.substring(5);
  }

  // Remove leading slash
  if (normalizedPath.startsWith('/')) {
    normalizedPath = normalizedPath.substring(1);
  }

  return normalizedPath;
}

/**
 * Utility class for working with Origin Private File System (OPFS)
 */
export class OPFSUtil {
  private rootDirectory: FileSystemDirectoryHandle | null = null;

  /**
   * Check if OPFS is available in the current browser
   */
  public async isAvailable(): Promise<boolean> {
    if (!('navigator' in window && 'storage' in navigator && 'getDirectory' in navigator.storage)) {
      return false;
    }

    // Try to actually access OPFS as an additional check
    try {
      const root = await navigator.storage.getDirectory();
      return !!root;
    } catch (error) {
      // OPFS access check failed
      return false;
    }
  }

  /**
   * Get the root directory handle, creating it if it doesn't exist
   */
  private async getRootDirectory(): Promise<FileSystemDirectoryHandle> {
    if (!this.rootDirectory) {
      try {
        this.rootDirectory = await navigator.storage.getDirectory();
      } catch (error) {
        // Failed to get OPFS root directory
        throw new Error('OPFS not available');
      }
    }
    return this.rootDirectory;
  }

  // Map to track open file handles
  private openHandles: Map<string, FileSystemFileHandle> = new Map();

  // Track active access handles to prevent concurrent access errors
  private activeAccessHandles: Map<string, any> = new Map();

  /**
   * Get a file handle directly from OPFS
   * Uses a cache to prevent creating multiple handles for the same file
   */
  public async getFileHandle(
    filename: string,
    create: boolean = true,
  ): Promise<FileSystemFileHandle> {
    // Normalize the path to ensure consistent lookups
    const normalizedPath = this.normalizePath(filename);

    try {
      // Check if we already have this handle
      if (this.openHandles.has(normalizedPath)) {
        return this.openHandles.get(normalizedPath)!;
      }

      // Get new handle
      const { dirHandle, fileName } = await this.getHandlesFromPath(filename);
      const fileHandle = await dirHandle.getFileHandle(fileName, { create });

      // Store the handle for reuse
      this.openHandles.set(normalizedPath, fileHandle);
      return fileHandle;
    } catch (error) {
      console.error(`Error getting file handle for ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Normalize a path for consistent storage
   * @private
   */
  private normalizePath(path: string): string {
    return normalizeOpfsPath(path);
  }

  /**
   * Get directory and file handles from a path
   */
  private async getHandlesFromPath(path: string): Promise<{
    dirHandle: FileSystemDirectoryHandle;
    fileName: string;
  }> {
    // Use our normalize function for consistency
    const normalizedPath = this.normalizePath(path);

    const parts = normalizedPath.split('/').filter(Boolean);
    const fileName = parts.pop();

    if (!fileName) {
      throw new Error('Invalid path: no filename');
    }

    let dirHandle = await this.getRootDirectory();

    // Navigate through directories, creating them if needed
    for (const part of parts) {
      dirHandle = await dirHandle.getDirectoryHandle(part, { create: true });
    }

    return { dirHandle, fileName };
  }

  /**
   * Store a file at the specified path
   */
  public async storeFile(path: string, data: ArrayBuffer | Uint8Array): Promise<void> {
    // Close any existing sync access handle for this file
    await this.closeSyncAccessHandle(path);

    try {
      const fileHandle = await this.getFileHandle(path, true);

      const writable = await fileHandle.createWritable();

      try {
        // Ensure data is in the correct format for FileSystemWritableFileStream
        const writeData = data instanceof Uint8Array ? new Uint8Array(data) : data;
        await writable.write(writeData);
      } finally {
        await writable.close();
      }
    } catch (error) {
      console.error(`Error storing file ${path}:`, error);
      throw error;
    }
  }

  /**
   * Read a file from the specified path
   */
  public async readFile(path: string): Promise<ArrayBuffer> {
    try {
      await this.closeSyncAccessHandle(path);

      const fileHandle = await this.getFileHandle(path, false);

      const file = await fileHandle.getFile();

      return await file.arrayBuffer();
    } catch (error) {
      console.error(`Error reading file ${path}:`, error);
      throw new Error(`File not found: ${path}`);
    }
  }

  /**
   * Check if a file exists
   */
  public async fileExists(path: string): Promise<boolean> {
    try {
      await this.getFileHandle(path, false);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete a file
   */
  public async deleteFile(path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);

    await this.closeSyncAccessHandle(path);

    const { dirHandle, fileName } = await this.getHandlesFromPath(path);

    if (this.openHandles.has(normalizedPath)) {
      this.openHandles.delete(normalizedPath);
    }

    await dirHandle.removeEntry(fileName);
  }

  /**
   * Get the size of a file in bytes
   */
  public async getFileSize(path: string): Promise<number> {
    try {
      await this.closeSyncAccessHandle(path);

      const fileHandle = await this.getFileHandle(path, false);

      const file = await fileHandle.getFile();

      return file.size;
    } catch (error) {
      console.error(`Error getting file size for ${path}:`, error);
      return 0;
    }
  }

  /**
   * Get a sync access handle for a file
   * This ensures we don't create multiple sync access handles for the same file
   * which would cause the "Access Handles cannot be created..." error
   */
  public async getSyncAccessHandle(filename: string): Promise<any> {
    const normalizedPath = this.normalizePath(filename);

    if (this.activeAccessHandles.has(normalizedPath)) {
      return this.activeAccessHandles.get(normalizedPath);
    }

    try {
      const fileHandle = await this.getFileHandle(filename, true);

      // Create a new sync access handle
      // TypeScript doesn't know about this API yet, so we need to cast
      const accessHandle = await (fileHandle as any).createSyncAccessHandle();

      this.activeAccessHandles.set(normalizedPath, accessHandle);

      return accessHandle;
    } catch (error) {
      console.error(`Error creating sync access handle for ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Close a specific sync access handle
   */
  public async closeSyncAccessHandle(filename: string): Promise<void> {
    const normalizedPath = this.normalizePath(filename);

    if (this.activeAccessHandles.has(normalizedPath)) {
      const handle = this.activeAccessHandles.get(normalizedPath);
      try {
        await handle.close();
      } catch (error) {
        console.error(`Error closing sync access handle for ${filename}:`, error);
      } finally {
        this.activeAccessHandles.delete(normalizedPath);
      }
    }
  }

  /**
   * Closes all open file handles and sync access handles
   * Call this when shutting down or when you need to ensure all resources are released
   */
  public async closeAllHandles(): Promise<void> {
    for (const [path, handle] of this.activeAccessHandles.entries()) {
      try {
        await handle.close();
      } catch (error) {
        console.error(`Error closing sync access handle for ${path}:`, error);
      }
    }

    // Clear both maps
    this.activeAccessHandles.clear();
    this.openHandles.clear();
  }
}
