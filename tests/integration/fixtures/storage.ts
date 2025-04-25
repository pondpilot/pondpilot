import { test as base } from '@playwright/test';
import { createReadStream, readdirSync, ReadStream } from 'fs';
import path from 'path';
import { parsePath } from '../../utils';

declare global {
  interface Window {
    _writeStream?: FileSystemWritableFileStream;
    _writeBuffer?: Uint8Array;
  }
}

interface Storage {
  // Manipulate files in the browser's storage.

  /**
   * Uploads a file to the storage.
   * @param localPath - The path to the local file.
   * @param remotePath - The relative path to the remote file.
   */
  uploadFile: (localPath: string, remotePath: string) => Promise<void>;

  /**
   * Uploads a directory to the storage.
   * @param localPath - The path to the local directory.
   * @param remotePath - The relative path to the remote directory.
   */
  uploadDir: (localPath: string, remotePath: string) => Promise<void>;

  /**
   * Creates a directory in the storage.
   * @param remotePath - The relative path to the directory.
   */
  createDir: (remotePath: string) => Promise<void>;

  /**
   * Removes a file or directory from the storage.
   * @param remotePath - The relative path to the file or directory.
   */
  removeEntry: (remotePath: string) => Promise<void>;

  /**
   * Verifies if a file exists in the storage.
   * @param remotePath - The relative path to check.
   */
  verifyFileExists: (remotePath: string) => Promise<boolean>;

  /**
   * Verifies if a directory exists in the storage.
   * @param remotePath - The relative path to check.
   */
  verifyDirExists: (remotePath: string) => Promise<boolean>;

  /**
   TODO: wait for official API (https://github.com/whatwg/fs/pull/10), or just implement it as `copy and remove`.
   */
  moveFile: (remotePath: string, newRemotePath: string) => Promise<void>;
}

type StorageFixtures = {
  storage: Storage;
};

export const test = base.extend<StorageFixtures>({
  storage: async ({ page }, use) => {
    const storage: Storage = {
      uploadFile: async (localPath: string, remotePath: string) => {
        // 64KB chunks
        const chunkSize = 64 * 1024;
        let readStream: ReadStream | null = null;
        try {
          // Create a local read stream
          readStream = createReadStream(localPath, {
            highWaterMark: chunkSize,
          });

          // Get browser's writable stream
          await page.evaluate(async (filePath) => {
            let dirHandle = await navigator.storage.getDirectory();
            for (const dir of filePath.dirs) {
              dirHandle = await dirHandle.getDirectoryHandle(dir, { create: true });
            }
            const fileHandle = await dirHandle.getFileHandle(filePath.basename, { create: true });
            window._writeStream = await fileHandle.createWritable({ keepExistingData: false });
          }, parsePath(remotePath));

          // Reusable browser's buffer for writing
          await page.evaluate((size) => {
            window._writeBuffer = new Uint8Array(size);
          }, chunkSize);

          for await (const chunk of readStream) {
            const byteArray = Object.values(chunk);
            await page.evaluate<void, any[]>(async (bytes) => {
              const buffer = window._writeBuffer!;
              buffer.set(bytes);
              // The fix-sized buffer is used, but real size of chunk can be less than size of buffer, so we create a lightweight view.
              await window._writeStream!.write(buffer.subarray(0, bytes.length));
            }, byteArray);
          }
        } catch (error) {
          console.error('Error during upload file to storage');
          throw error;
        } finally {
          // Close streams
          if (readStream !== null) readStream.close();
          await page.evaluate(async () => {
            if (window._writeStream) await window._writeStream.close();
            window._writeStream = undefined;
            window._writeBuffer = undefined;
          });
        }

        // Verify the file was actually created before proceeding
        const exists = await storage.verifyFileExists(remotePath);
        if (!exists) {
          throw new Error(`File ${remotePath} was not successfully created in storage`);
        }
      },

      createDir: async (remotePath: string) => {
        await page.evaluate(async (storagePath) => {
          let dirHandle = await navigator.storage.getDirectory();
          for (const dir of storagePath.parts) {
            dirHandle = await dirHandle.getDirectoryHandle(dir, { create: true });
          }
        }, parsePath(remotePath));

        // Verify the directory was actually created
        const exists = await storage.verifyDirExists(remotePath);
        if (!exists) {
          throw new Error(`Directory ${remotePath} was not successfully created in storage`);
        }
      },

      uploadDir: async (localPath: string, remotePath: string) => {
        const entries = readdirSync(localPath, { withFileTypes: true, recursive: true });
        for (const entry of entries) {
          const entryLocalPath = path.join(entry.parentPath, entry.name);
          const entryLocalRelativePath = path.relative(localPath, entryLocalPath);
          const entryRemotePath = path.join(remotePath, entryLocalRelativePath);
          if (entry.isDirectory()) {
            await storage.createDir(entryRemotePath);
          } else if (entry.isFile()) {
            await storage.uploadFile(entryLocalPath, entryRemotePath);
          }
        }

        // Verify the directory was created before proceeding
        const exists = await storage.verifyDirExists(remotePath);
        if (!exists) {
          throw new Error(`Directory ${remotePath} was not successfully created in storage`);
        }
      },

      removeEntry: async (remotePath: string) => {
        await page.evaluate(async (filePath) => {
          let dirHandle = await navigator.storage.getDirectory();
          for (const dir of filePath.dirs) {
            dirHandle = await dirHandle.getDirectoryHandle(dir, { create: true });
          }
          await dirHandle.removeEntry(filePath.basename, { recursive: true });
        }, parsePath(remotePath));
      },

      verifyFileExists: async (remotePath: string) => {
        const res = await page.evaluate(async (filePath) => {
          try {
            let dirHandle = await navigator.storage.getDirectory();
            for (const dir of filePath.dirs) {
              dirHandle = await dirHandle.getDirectoryHandle(dir);
            }
            await dirHandle.getFileHandle(filePath.basename);
            return true;
          } catch (error) {
            return false;
          }
        }, parsePath(remotePath));

        return res;
      },

      verifyDirExists: async (remotePath: string) => {
        const res = await page.evaluate(async (dirPath) => {
          try {
            let dirHandle = await navigator.storage.getDirectory();
            const parts = dirPath.parts || [dirPath.basename];
            for (const dir of parts) {
              dirHandle = await dirHandle.getDirectoryHandle(dir);
            }
            return true;
          } catch (error) {
            return false;
          }
        }, parsePath(remotePath));

        return res;
      },

      moveFile: async (remotePath: string, newRemotePath: string) => {
        throw new Error(`Move file is not implemented: ${remotePath} -> ${newRemotePath}`);
      },
    };
    await use(storage);
  },
});
