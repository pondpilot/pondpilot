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
  selectMultipleNodes,
  clickNodeByIndex,
  clickNodeByName,
  renameExplorerItem,
} from './utils/explorer-tree';

type DBExplorerFixtures = {
  /**
   * DB explorer locator
   */
  dbExplorer: Locator;

  /**
   * Add database button locator
   */
  addDatabaseButton: Locator;

  openDatabaseExplorer: () => Promise<void>;
  openDatabaseFromExplorer: (dbName: string) => Promise<void>;
  assertDBExplorerItems: (expected: string[]) => Promise<void>;
  getAllDBNodes: () => Promise<Locator>;
  getDBNodeByName: (dbName: string) => Promise<Locator>;
  getDBNodeByIndex: (index: number) => Promise<Locator>;
  getDBNodeById: (dbId: string) => Promise<Locator>;
  getDBIdByName: (dbName: string) => Promise<string>;
  clickDBByIndex: (index: number) => Promise<Locator>;
  clickDBByName: (dbName: string) => Promise<Locator>;
  selectMultipleDBNodes: (indices: number[]) => Promise<Locator[]>;
  assertDBNodesSelection: (expectedSelectedIndices: number[]) => Promise<void>;
  deselectAllDBs: () => Promise<void>;
  clickDBNodeMenuItemByName: (dbName: string, menuItemName: string) => Promise<void>;
  renameDBInExplorer: (oldName: string, newName: string, alias?: string) => Promise<void>;
};

const DB_EXPLORER_DATA_TESTID_PREFIX = 'db-explorer';

export const test = base.extend<DBExplorerFixtures>({
  dbExplorer: async ({ page }, use) => {
    await use(page.getByTestId(DB_EXPLORER_DATA_TESTID_PREFIX));
  },

  openDatabaseExplorer: async ({ page, dbExplorer }, use) => {
    await use(async () => {
      await page.getByTestId('navbar-show-databases-button').click();
      await expect(dbExplorer).toBeVisible();
    });
  },

  addDatabaseButton: async ({ page }, use) => {
    await use(page.getByTestId('navbar-add-file-button'));
  },

  openDatabaseFromExplorer: async ({ getDBNodeByName }, use) => {
    await use(async (dbName: string) => {
      const dbItem = await getDBNodeByName(dbName);
      await dbItem.click();
    });
  },

  getAllDBNodes: async ({ page }, use) => {
    await use(async (): Promise<Locator> => {
      // Find all DB explorer nodes
      return getAllExplorerTreeNodes(page, DB_EXPLORER_DATA_TESTID_PREFIX);
    });
  },

  getDBNodeByName: async ({ page }, use) => {
    await use(async (dbName: string): Promise<Locator> => {
      return getExplorerTreeNodeByName(page, DB_EXPLORER_DATA_TESTID_PREFIX, dbName);
    });
  },

  getDBNodeByIndex: async ({ page }, use) => {
    await use(async (index: number): Promise<Locator> => {
      return getExplorerTreeNodeByIndex(page, DB_EXPLORER_DATA_TESTID_PREFIX, index);
    });
  },

  getDBNodeById: async ({ page }, use) => {
    await use(async (dbId: string): Promise<Locator> => {
      return getExplorerTreeNodeById(page, DB_EXPLORER_DATA_TESTID_PREFIX, dbId);
    });
  },

  getDBIdByName: async ({ page }, use) => {
    await use(async (dbName: string): Promise<string> => {
      return await getExplorerTreeNodeIdByName(page, DB_EXPLORER_DATA_TESTID_PREFIX, dbName);
    });
  },

  assertDBExplorerItems: async ({ page }, use) => {
    await use(async (expected: string[]) => {
      await assertExplorerItems(page, DB_EXPLORER_DATA_TESTID_PREFIX, expected);
    });
  },

  clickDBByIndex: async ({ page }, use) => {
    await use(async (index: number): Promise<Locator> => {
      return await clickNodeByIndex(page, DB_EXPLORER_DATA_TESTID_PREFIX, index);
    });
  },

  clickDBByName: async ({ page }, use) => {
    await use(async (dbName: string): Promise<Locator> => {
      return await clickNodeByName(page, DB_EXPLORER_DATA_TESTID_PREFIX, dbName);
    });
  },

  selectMultipleDBNodes: async ({ page }, use) => {
    await use(async (indices: number[]): Promise<Locator[]> => {
      return await selectMultipleNodes(page, DB_EXPLORER_DATA_TESTID_PREFIX, indices);
    });
  },

  assertDBNodesSelection: async ({ page }, use) => {
    await use(async (expectedSelectedIndices: number[]) => {
      await assertScriptNodesSelection(
        page,
        DB_EXPLORER_DATA_TESTID_PREFIX,
        expectedSelectedIndices,
      );
    });
  },

  deselectAllDBs: async ({ page, getAllDBNodes }, use) => {
    await use(async () => {
      const allDBNodes = await getAllDBNodes();

      // First check that there is a selection in the first place
      const selectedNode = (await allDBNodes.all()).find((node) =>
        isExplorerTreeNodeSelected(node),
      );
      if (!selectedNode) {
        throw new Error('No DB nodes are selected');
      }

      // Deselect all items using Escape
      await page.keyboard.press('Escape');
    });
  },

  clickDBNodeMenuItemByName: async ({ page }, use) => {
    await use(async (dbName: string, menuItemName: string) => {
      await clickExplorerTreeNodeMenuItemByName(
        page,
        DB_EXPLORER_DATA_TESTID_PREFIX,
        dbName,
        menuItemName,
      );
    });
  },

  renameDBInExplorer: async ({ page }, use) => {
    await use(async (oldName: string, newName: string, alias?: string) => {
      await renameExplorerItem(page, DB_EXPLORER_DATA_TESTID_PREFIX, oldName, newName, alias);
    });
  },
});
