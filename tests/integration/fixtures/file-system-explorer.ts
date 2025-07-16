/* eslint-disable no-case-declarations */

import { test as base, expect, Locator } from '@playwright/test';

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
  renameFileInExplorer: (props: {
    oldName: string;
    newName: string;
    expectedNameInExplorer?: string;
  }) => Promise<void>;
  clickFileByIndex: (index: number) => Promise<Locator>;
  clickFileByName: (fileName: string) => Promise<Locator>;
  selectMultipleFileNodes: (indices: number[]) => Promise<Locator[]>;
  assertFileNodesSelection: (expectedSelectedIndices: number[]) => Promise<void>;
  deselectAllFiles: () => Promise<void>;
  clickFileMenuItemByName: (fileName: string, menuItemName: string) => Promise<void>;
  createScriptFromFileExplorer: (fileName: string) => Promise<void>;
  openDatasourceWizard: () => Promise<void>;
  addFile: () => Promise<void>;
  addFolder: () => Promise<void>;
};

export const FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX = 'data-explorer-fs';

export const test = base.extend<FileSystemExplorerFixtures>({
  fileSystemExplorer: async ({ page }, use) => {
    await use(page.getByTestId(FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX));
  },

  openFileSystemExplorer: async ({ page, fileSystemExplorer }, use) => {
    await use(async () => {
      await page.getByTestId('navbar-show-files-button').click();
      await expect(fileSystemExplorer).toBeVisible();
    });
  },

  openDatasourceWizard: async ({ page }, use) => {
    await use(async () => {
      await page.getByTestId('navbar-add-datasource-button').click();
    });
  },

  addFileButton: async ({ page }, use) => {
    await use(page.getByTestId('datasource-modal-add-file-card'));
  },

  addFolderButton: async ({ page }, use) => {
    await use(page.getByTestId('datasource-modal-add-folder-button'));
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
    await use(async ({ oldName, newName, expectedNameInExplorer }) => {
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

  addFile: async ({ page }, use) => {
    await use(async () => {
      await page.getByTestId('navbar-add-datasource-button').click();
      const addFileButton = page.getByTestId('datasource-modal-add-file-card');
      await expect(addFileButton).toBeVisible();
      await addFileButton.click();
    });
  },

  addFolder: async ({ page }, use) => {
    await use(async () => {
      await page.getByTestId('navbar-add-datasource-button').click();
      const addFolderButton = page.getByTestId('datasource-modal-add-folder-card');
      await expect(addFolderButton).toBeVisible();
      await addFolderButton.click();
    });
  },
});
