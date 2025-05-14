import { execSync } from 'child_process';
import path from 'path';

import { supportedDataSourceFileExt } from '@models/file-system';
import { test as base, mergeTests } from '@playwright/test';
import { assertNeverValueType } from '@utils/typing';
import * as XLSX from 'xlsx';

import { test as fileSystemExplorer } from './file-system-explorer';
import { test as storageTest } from './storage';
import { test as testTmpTest } from './test-tmp';
import { createFile, parsePath } from '../../utils';
import { FileSystemNode } from '../models';

export const FILE_SYSTEM_TREE: FileSystemNode[] = [
  {
    type: 'file',
    ext: 'csv',
    content: 'col\ndata1',
    name: 'a',
  },
  {
    type: 'file',
    ext: 'json',
    content: '{"col": "data2"}',
    name: 'a',
  },
  {
    type: 'file',
    ext: 'xlsx',
    content: '[{"col": "dataXLSX1"}]',
    name: 'xlsx-test',
  },
  {
    type: 'file',
    ext: 'parquet',
    content: "SELECT 'data3' AS col;",
    name: 'parquet-test',
  },
  {
    type: 'file',
    ext: 'duckdb',
    content: 'CREATE VIEW test_view AS SELECT 123 AS value;',
    name: 'testdb',
  },
  {
    type: 'dir',
    name: 'dir-a',
    children: [
      {
        type: 'file',
        ext: 'csv',
        content: 'col\ndataA1',
        name: 'a',
      },
      {
        type: 'file',
        ext: 'json',
        content: '{"col": "dataA2"}',
        name: 'a',
      },

      {
        type: 'dir',
        name: 'dir-b',
        children: [
          {
            type: 'file',
            ext: 'csv',
            content: 'col\ndataB1',
            name: 'a',
          },
          {
            type: 'file',
            ext: 'json',
            content: '{"col": "dataB2"}',
            name: 'a',
          },
        ],
      },
    ],
  },
];

interface FilePicker {
  // Playwright does not support it (https://github.com/microsoft/playwright/issues/8850).
  // So we have to patch the files and directory pickers Browser API.

  // Works only for files located in the browser's storage.
  // To load local files to the browser's storage, use the `Storage` fixture.

  /**
   * Patches the file picker to return the specified files without opening the file picker dialog.
   * @param filePaths - The relative paths to the files in the browser's storage.
   */
  selectFiles: (filePaths: string[]) => Promise<void>;

  /**
   * Patches the directory picker to return the specified directory without opening the directory picker dialog.
   * @param dirPath - The relative path to the directory in the browser's storage.
   */
  selectDir: (dirPath: string) => Promise<void>;
}

type FilePickerFixtures = {
  filePicker: FilePicker;
  setupFileSystem: (fileTree: FileSystemNode[]) => Promise<void>;
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

const baseTest = mergeTests(storageTest, testTmpTest, base, fileSystemExplorer);

export const test = baseTest.extend<FilePickerFixtures>({
  filePicker: async ({ page }, use) => {
    // Use `Object.defineProperty()` instead of just `window.prop = ...` to ignore complex type signature with overloading.
    // Only expected return type is important here.
    const filePicker: FilePicker = {
      selectFiles: async (filePaths: string[]) => {
        await page.evaluate(
          ({ storagePaths, retries, retryDelay }) => {
            Object.defineProperty(window, 'showOpenFilePicker', {
              value: async (): Promise<FileSystemFileHandle[]> => {
                const ret: FileSystemFileHandle[] = [];

                const tryGetFiles = async (attempt = 0): Promise<FileSystemFileHandle[]> => {
                  try {
                    for (const filePath of storagePaths) {
                      let dirHandle = await navigator.storage.getDirectory();
                      for (const dir of filePath.dirs) {
                        dirHandle = await dirHandle.getDirectoryHandle(dir);
                      }
                      const fileHandle = await dirHandle.getFileHandle(filePath.basename);
                      ret.push(fileHandle);
                    }
                    return ret;
                  } catch (error) {
                    if (attempt < retries) {
                      console.warn(
                        `File picker retry ${attempt + 1}/${retries} after error: ${error}`,
                      );
                      // Wait before retrying
                      await new Promise((resolve) => setTimeout(resolve, retryDelay));
                      return tryGetFiles(attempt + 1);
                    }
                    throw error;
                  }
                };

                return tryGetFiles();
              },
            });
          },
          {
            storagePaths: filePaths.map((p) => parsePath(p)),
            retries: MAX_RETRIES,
            retryDelay: RETRY_DELAY_MS,
          },
        );
      },
      selectDir: async (dirPath: string) => {
        await page.evaluate(
          ({ storagePath, retries, retryDelay }) => {
            Object.defineProperty(window, 'showDirectoryPicker', {
              value: async (): Promise<FileSystemDirectoryHandle> => {
                const tryGetDir = async (attempt = 0): Promise<FileSystemDirectoryHandle> => {
                  try {
                    let dirHandle = await navigator.storage.getDirectory();
                    for (const dir of storagePath.parts) {
                      dirHandle = await dirHandle.getDirectoryHandle(dir);
                    }
                    return dirHandle;
                  } catch (error) {
                    if (attempt < retries) {
                      console.warn(
                        `Directory picker retry ${attempt + 1}/${retries} after error: ${error}`,
                      );
                      // Wait before retrying
                      await new Promise((resolve) => setTimeout(resolve, retryDelay));
                      return tryGetDir(attempt + 1);
                    }
                    throw error;
                  }
                };

                return tryGetDir();
              },
            });
          },
          {
            storagePath: parsePath(dirPath),
            retries: MAX_RETRIES,
            retryDelay: RETRY_DELAY_MS,
          },
        );
      },
    };
    await use(filePicker);
  },
  setupFileSystem: async (
    { addFileButton, storage, testTmp, filePicker, addFolderButton, page },
    use,
  ) => {
    await use(async (fileTree: FileSystemNode[]) => {
      // Convert the tree structure into flat lists
      const directories: string[] = [];
      const files: {
        path: string;
        content: string;
        localPath: string;
        name: string;
        ext: supportedDataSourceFileExt;
      }[] = [];
      const rootFiles: string[] = [];
      const rootDirs: string[] = [];

      // Function to traverse the tree and form flat lists
      function traverseFileSystem(nodes: FileSystemNode[], currentPath: string = '') {
        for (const node of nodes) {
          if (node.type === 'dir') {
            const dirPath = path.join(currentPath, node.name);
            directories.push(dirPath);
            if (currentPath === '') {
              rootDirs.push(dirPath);
            }
            if (node.children && node.children.length > 0) {
              traverseFileSystem(node.children, dirPath);
            }
          } else if (node.type === 'file') {
            const filePath = path.join(currentPath, `${node.name}.${node.ext}`);
            const localPath = testTmp.join(`
                ${node.name}_${currentPath.replace(/\//g, '_')}.${node.ext}`);

            files.push({
              path: filePath,
              content: node.content,
              localPath,
              name: node.name,
              ext: node.ext,
            });

            // If the file is in the root, add its path for selection via filePicker
            if (currentPath === '') {
              rootFiles.push(filePath);
            }
          }
        }
      }

      // Create flat lists
      traverseFileSystem(fileTree);

      // 1. Create all directories
      for (const dir of directories) {
        await storage.createDir(dir);
      }

      // 2. Create and upload all files
      for (const file of files) {
        switch (file.ext) {
          case 'parquet':
            // eslint-disable-next-line no-case-declarations
            const parquetPath = testTmp.join('exported_view.parquet');
            execSync(
              `duckdb -c "CREATE VIEW export_view AS ${file.content} COPY (SELECT * FROM export_view) TO '${parquetPath}' (FORMAT 'parquet');"`,
            );
            await storage.uploadFile(parquetPath, file.path);
            break;

          case 'duckdb':
            // eslint-disable-next-line no-case-declarations
            const dbPath = testTmp.join(file.path);
            execSync(`duckdb "${dbPath}" -c "${file.content}"`);
            await storage.uploadFile(dbPath, file.path);
            break;

          case 'json':
          case 'csv':
            // For CSV and JSON files, we create them locally and upload
            // the local copy to the storage
            // eslint-disable-next-line no-case-declarations
            const textFilePath = testTmp.join(file.path);
            createFile(textFilePath, file.content);
            await storage.uploadFile(textFilePath, file.path);
            break;

          case 'xlsx':
            // eslint-disable-next-line no-case-declarations
            const xlsxFilePath = testTmp.join(file.path);
            // eslint-disable-next-line no-case-declarations
            let json;
            try {
              json = JSON.parse(file.content);
            } catch (e) {
              json = [{ col: file.content }];
            }
            // eslint-disable-next-line no-case-declarations
            const ws = XLSX.utils.json_to_sheet(json, { skipHeader: true });
            // eslint-disable-next-line no-case-declarations
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
            XLSX.writeFile(wb, xlsxFilePath);
            await storage.uploadFile(xlsxFilePath, file.path);
            break;

          default:
            assertNeverValueType(file.ext);
        }
      }

      // 3. Add root files via UI
      await filePicker.selectFiles(rootFiles);
      await addFileButton.click();
      // Wait for the file picker to do its job
      // eslint-disable-next-line playwright/no-wait-for-timeout
      await page.waitForTimeout(1000);

      for (const rootDir of rootDirs) {
        await filePicker.selectDir(rootDir);
        await addFolderButton.click();
        // Wait for the file picker to do its job
        // eslint-disable-next-line playwright/no-wait-for-timeout
        await page.waitForTimeout(1000);
      }
    });
  },
});
