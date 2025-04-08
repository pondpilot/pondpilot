import { test as base, JSHandle } from '@playwright/test';
import { createReadStream, readdirSync } from 'fs';
import path from 'path';
import { parsePath } from '../../utils';

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

        // Create a local read stream
        const readStream = createReadStream(localPath, {
          highWaterMark: chunkSize,
        });

        // Get browser's writable stream
        const writeStream = await page.evaluateHandle(async (filePath) => {
          let dirHandle = await navigator.storage.getDirectory();
          for (const dir of filePath.dirs) {
            dirHandle = await dirHandle.getDirectoryHandle(dir, { create: true });
          }
          const fileHandle = await dirHandle.getFileHandle(filePath.basename, { create: true });
          const ws = await fileHandle.createWritable({ keepExistingData: false });
          return ws;
        }, parsePath(remotePath));

        // Reusable browser's buffer for writing
        const chunkBuffer = await page.evaluateHandle(
          async (size) => new Uint8Array(size),
          chunkSize,
        );

        // const startAll = performance.now();
        // let size = 0;
        try {
          for await (const chunk of readStream) {
            // const start = performance.now();
            const byteArray = Object.values(chunk);
            await page.evaluate<
              void,
              [JSHandle<FileSystemWritableFileStream>, any[], JSHandle<Uint8Array<ArrayBuffer>>]
            >(
              async ([ws, bytes, buffer]) => {
                buffer.set(bytes);
                // The fix-sized buffer is used, but real size of chunk can be less than size of buffer, so we create a lightweight view.
                await ws.write(buffer.subarray(0, bytes.length));
              },
              [writeStream, byteArray, chunkBuffer],
            );
            // const duration = performance.now() - start;
            // console.log(`Chunk time ${duration.toFixed(2)}ms`);
            // size += byteArray.length;
            // console.log('Size (bytes):', size);
          }
        } catch (error) {
          console.error('Error during upload file to storage');
          throw error;
        } finally {
          // const durationAll = performance.now() - startAll;
          // console.log(`Total time ${durationAll.toFixed(2)}ms`);
          readStream.close();
          await page.evaluate(async (ws) => {
            await ws.close();
          }, writeStream);
          await writeStream.dispose();
          await chunkBuffer.dispose();
        }
      },
      createDir: async (remotePath: string) => {
        await page.evaluate(async (storagePath) => {
          let dirHandle = await navigator.storage.getDirectory();
          for (const dir of storagePath.parts) {
            dirHandle = await dirHandle.getDirectoryHandle(dir, { create: true });
          }
        }, parsePath(remotePath));
      },
      uploadDir: async (localPath: string, remotePath: string) => {
        readdirSync(localPath, { withFileTypes: true, recursive: true }).forEach((entry) => {
          const entryLocalPath = path.join(entry.parentPath, entry.name);
          const entryLocalRelativePath = path.relative(localPath, entryLocalPath);
          const entryRemotePath = path.join(remotePath, entryLocalRelativePath);
          if (entry.isDirectory()) {
            storage.createDir(entryRemotePath);
          } else if (entry.isFile()) {
            storage.uploadFile(entryLocalPath, entryRemotePath);
          }
        });
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
      moveFile: async (remotePath: string, newRemotePath: string) => {
        throw new Error(`Move file is not implemented: ${remotePath} -> ${newRemotePath}`);
      },
    };
    await use(storage);
  },
});
