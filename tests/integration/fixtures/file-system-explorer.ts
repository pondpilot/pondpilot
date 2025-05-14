import { execSync } from 'child_process';
import path from 'path';

import { test as base, expect, Locator, mergeTests } from '@playwright/test';
import * as XLSX from 'xlsx';

import { test as filePickerTest } from './file-picker';
import { test as storageTest } from './storage';
import { test as testTmpTest } from './test-tmp';
import {
  assertExplorerItems,
  assertScriptNodesSelection,
  clickExplorerTreeNodeMenuItemByName,
  getAllExplorerTreeNodes,
  getExplorerTreeNodeById,
  getExplorerTreeNodeByIndex,
  getExplorerTreeNodeByName,
  getExplorerTreeNodeIdByName,
  isExplorerTreeNodeSelected,
  renameExplorerItem,
  selectMultipleNodes,
  clickNodeByIndex,
  clickNodeByName,
} from './utils/explorer-tree';
import { createFile } from '../../utils';
import { FileSystemNode } from '../file-import-export/models';

type FileSystemExplorerFixtures = {
  /**
   * File system explorer locator
   */
  fileSystemExplorer: Locator;

  /**
   * Add file button locator
   */
  addFileButton: Locator;

  /**
   * Add file button locator
   */
  addFolderButton: Locator;

  openFileSystemExplorer: () => Promise<void>;
  openFileFromExplorer: (fileName: string) => Promise<void>;
  assertFileExplorerItems: (expected: string[]) => Promise<void>;
  getAllFileNodes: () => Promise<Locator>;
  getFileNodeByName: (fileName: string) => Promise<Locator>;
  getFileNodeByIndex: (index: number) => Promise<Locator>;
  getFileNodeById: (fileId: string) => Promise<Locator>;
  getFileIdByName: (fileName: string) => Promise<string>;
  renameFileInExplorer: (
    oldName: string,
    newName: string,
    expectedNameInExplorer?: string,
  ) => Promise<void>;
  clickFileByIndex: (index: number) => Promise<Locator>;
  clickFileByName: (fileName: string) => Promise<Locator>;
  selectMultipleFileNodes: (indices: number[]) => Promise<Locator[]>;
  assertFileNodesSelection: (expectedSelectedIndices: number[]) => Promise<void>;
  deselectAllFiles: () => Promise<void>;
  clickFileMenuItemByName: (fileName: string, menuItemName: string) => Promise<void>;
  createScriptFromFileExplorer: (fileName: string) => Promise<void>;
  setupFileSystem: (fileTree: FileSystemNode[]) => Promise<void>;
};

export const FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX = 'file-system-explorer';

const baseTest = mergeTests(storageTest, testTmpTest, base, filePickerTest);

export const test = baseTest.extend<FileSystemExplorerFixtures>({
  fileSystemExplorer: async ({ page }, use) => {
    await use(page.getByTestId(FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX));
  },

  openFileSystemExplorer: async ({ page, fileSystemExplorer }, use) => {
    await use(async () => {
      await page.getByTestId('navbar-show-files-button').click();
      await expect(fileSystemExplorer).toBeVisible();
    });
  },

  addFileButton: async ({ page }, use) => {
    await use(page.getByTestId('navbar-add-file-button'));
  },

  addFolderButton: async ({ page }, use) => {
    await use(page.getByTestId('navbar-add-folder-button'));
  },

  openFileFromExplorer: async ({ getFileNodeByName }, use) => {
    await use(async (fileName: string) => {
      const fileItem = await getFileNodeByName(fileName);
      await fileItem.click();
    });
  },

  getAllFileNodes: async ({ page }, use) => {
    await use(async (): Promise<Locator> => {
      // Find all file explorer nodes
      return getAllExplorerTreeNodes(page, FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX);
    });
  },

  getFileNodeByName: async ({ page }, use) => {
    await use(async (fileName: string): Promise<Locator> => {
      return getExplorerTreeNodeByName(page, FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX, fileName);
    });
  },

  getFileNodeByIndex: async ({ page }, use) => {
    await use(async (index: number): Promise<Locator> => {
      return getExplorerTreeNodeByIndex(page, FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX, index);
    });
  },

  getFileNodeById: async ({ page }, use) => {
    await use(async (fileId: string): Promise<Locator> => {
      return getExplorerTreeNodeById(page, FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX, fileId);
    });
  },

  getFileIdByName: async ({ page }, use) => {
    await use(async (fileName: string): Promise<string> => {
      return await getExplorerTreeNodeIdByName(
        page,
        FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX,
        fileName,
      );
    });
  },

  renameFileInExplorer: async ({ page }, use) => {
    await use(async (oldName: string, newName: string, expectedNameInExplorer?: string) => {
      await renameExplorerItem(
        page,
        FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX,
        oldName,
        newName,
        expectedNameInExplorer,
      );
    });
  },

  assertFileExplorerItems: async ({ page }, use) => {
    await use(async (expected: string[]) => {
      await assertExplorerItems(page, FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX, expected);
    });
  },

  clickFileByIndex: async ({ page }, use) => {
    await use(async (index: number): Promise<Locator> => {
      return await clickNodeByIndex(page, FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX, index);
    });
  },

  clickFileByName: async ({ page }, use) => {
    await use(async (fileName: string): Promise<Locator> => {
      return await clickNodeByName(page, FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX, fileName);
    });
  },

  selectMultipleFileNodes: async ({ page }, use) => {
    await use(async (indices: number[]): Promise<Locator[]> => {
      return await selectMultipleNodes(page, FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX, indices);
    });
  },

  assertFileNodesSelection: async ({ page }, use) => {
    await use(async (expectedSelectedIndices: number[]) => {
      await assertScriptNodesSelection(
        page,
        FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX,
        expectedSelectedIndices,
      );
    });
  },

  deselectAllFiles: async ({ page, getAllFileNodes }, use) => {
    await use(async () => {
      const allFileNodes = await getAllFileNodes();

      // First check that there is a selection in the first place
      const selectedNode = (await allFileNodes.all()).find((node) =>
        isExplorerTreeNodeSelected(node),
      );
      if (!selectedNode) {
        throw new Error('No file nodes are selected');
      }

      // Deselect all items using Escape
      await page.keyboard.press('Escape');
    });
  },

  clickFileMenuItemByName: async ({ page }, use) => {
    await use(async (dbName: string, menuItemName: string) => {
      await clickExplorerTreeNodeMenuItemByName(
        page,
        FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX,
        dbName,
        menuItemName,
      );
    });
  },

  createScriptFromFileExplorer: async ({ page }, use) => {
    await use(async (fileName: string) => {
      await clickExplorerTreeNodeMenuItemByName(
        page,
        FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX,
        fileName,
        'Create a Query',
      );
    });
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
        ext: 'csv' | 'json' | 'parquet' | 'duckdb' | 'xlsx';
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
        if (file.ext === 'parquet') {
          const parquetPath = testTmp.join('exported_view.parquet');

          execSync(
            `duckdb -c "CREATE VIEW export_view AS ${file.content} COPY (SELECT * FROM export_view) TO '${parquetPath}' (FORMAT 'parquet');"`,
          );

          await storage.uploadFile(parquetPath, file.path);
          continue;
        }
        if (file.ext === 'duckdb') {
          const dbPath = testTmp.join(file.path);
          execSync(`duckdb "${dbPath}" -c "${file.content}"`);
          await storage.uploadFile(dbPath, file.path);
          continue;
        }
        if (file.ext === 'json' || file.ext === 'csv') {
          // For CSV and JSON files, we create them locally and upload
          // the local copy to the storage
          const filePath = testTmp.join(file.path);
          createFile(filePath, file.content);
          await storage.uploadFile(filePath, file.path);
          continue;
        }
        if (file.ext === 'xlsx') {
          const filePath = testTmp.join(file.path);
          let json;
          try {
            json = JSON.parse(file.content);
          } catch (e) {
            json = [{ col: file.content }];
          }
          const ws = XLSX.utils.json_to_sheet(json, { skipHeader: true });
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
          XLSX.writeFile(wb, filePath);
          await storage.uploadFile(filePath, file.path);
          continue;
        }
      }

      // 3. Add root files via UI
      await filePicker.selectFiles(rootFiles);
      await addFileButton.click();
      await page.waitForTimeout(1500);

      for (const rootDir of rootDirs) {
        await filePicker.selectDir(rootDir);
        await addFolderButton.click();
        // eslint-disable-next-line playwright/no-wait-for-timeout
        await page.waitForTimeout(1500);
      }
    });
  },
});
