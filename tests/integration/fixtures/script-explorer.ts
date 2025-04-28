import { test as base, expect, Locator } from '@playwright/test';
import {
  assertExplorerItems,
  assertScriptNodesSelection,
  getAllExplorerTreeNodes,
  getExplorerTreeNodeById,
  getExplorerTreeNodeByIndex,
  getExplorerTreeNodeByName,
  getExplorerTreeNodeIdByName,
  isExplorerTreeNodeSelected,
  renameExplorerItem,
  selectMultipleNodes,
  clickNodeByIndex,
  clickExplorerTreeNodeMenuItemByName,
  checkIfExplorerItemExists,
} from './utils/explorer-tree';

type ScriptExplorerFixtures = {
  scriptExplorer: Locator;
  createScriptAndSwitchToItsTab: () => Promise<void>;
  openScriptFromExplorer: (scriptName: string) => Promise<void>;
  getAllScriptNodes: () => Promise<Locator>;
  getScriptNodeByName: (scriptName: string) => Promise<Locator>;
  getScriptNodeByIndex: (index: number) => Promise<Locator>;
  getScriptNodeById: (scriptId: string) => Promise<Locator>;
  getScriptIdByName: (scriptName: string) => Promise<string>;
  renameScriptInExplorer: (oldName: string, newName: string) => Promise<void>;
  checkIfScriptExists: (scriptName: string) => Promise<boolean>;
  assertScriptExplorerItems: (expected: string[]) => Promise<void>;
  clickScriptByIndex: (index: number) => Promise<Locator>;
  selectMultipleScriptNodes: (indices: number[]) => Promise<Locator[]>;
  assertScriptNodesSelection: (expectedSelectedIndices: number[]) => Promise<void>;
  deselectAllScripts: () => Promise<void>;
  clickScriptNodeMenuItemByName: (scriptName: string, menuItemName: string) => Promise<void>;
};

const SCRIPT_EXPLORER_DATA_TESTID_PREFIX = 'script-explorer';

export const test = base.extend<ScriptExplorerFixtures>({
  scriptExplorer: async ({ page }, use) => {
    await use(page.getByTestId(SCRIPT_EXPLORER_DATA_TESTID_PREFIX));
  },

  getAllScriptNodes: async ({ page }, use) => {
    await use(async (): Promise<Locator> => {
      // Find all script explorer nodes
      return getAllExplorerTreeNodes(page, SCRIPT_EXPLORER_DATA_TESTID_PREFIX);
    });
  },

  createScriptAndSwitchToItsTab: async ({ page, getAllScriptNodes, getScriptNodeById }, use) => {
    await use(async () => {
      const scriptNodes = await getAllScriptNodes();

      // Save existing script node IDs
      const existingSctiptNodeIds = await scriptNodes.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-value')),
      );

      // Click the button to create a new script
      await page.getByTestId('script-explorer-add-script-button').click();

      // Get the updated script node IDs
      const updatedScriptNodeIds = await scriptNodes.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-value')),
      );

      // Find the new script node ID
      const newScriptNodeId = updatedScriptNodeIds.find(
        (id) => !existingSctiptNodeIds.includes(id),
      );

      if (!newScriptNodeId) {
        throw new Error('New script node ID not found');
      }

      const newScriptNode = await getScriptNodeById(newScriptNodeId);

      // Check that it has the selected data attribute. This assumes that
      // tab is open and avoids dpending this test on tab fixtures.
      await expect(newScriptNode).toHaveAttribute('data-selected', 'true');
    });
  },

  openScriptFromExplorer: async ({ getScriptNodeByName }, use) => {
    await use(async (scriptName: string) => {
      const scriptItem = await getScriptNodeByName(scriptName);
      await scriptItem.click();
    });
  },

  getScriptNodeByName: async ({ page }, use) => {
    await use(async (scriptName: string): Promise<Locator> => {
      return getExplorerTreeNodeByName(page, SCRIPT_EXPLORER_DATA_TESTID_PREFIX, scriptName);
    });
  },

  getScriptNodeByIndex: async ({ page }, use) => {
    await use(async (index: number): Promise<Locator> => {
      return getExplorerTreeNodeByIndex(page, SCRIPT_EXPLORER_DATA_TESTID_PREFIX, index);
    });
  },

  getScriptNodeById: async ({ page }, use) => {
    await use(async (scriptId: string): Promise<Locator> => {
      return getExplorerTreeNodeById(page, SCRIPT_EXPLORER_DATA_TESTID_PREFIX, scriptId);
    });
  },

  getScriptIdByName: async ({ page }, use) => {
    await use(async (scriptName: string): Promise<string> => {
      return await getExplorerTreeNodeIdByName(
        page,
        SCRIPT_EXPLORER_DATA_TESTID_PREFIX,
        scriptName,
      );
    });
  },

  renameScriptInExplorer: async ({ page }, use) => {
    await use(async (oldName: string, newName: string) => {
      await renameExplorerItem(page, SCRIPT_EXPLORER_DATA_TESTID_PREFIX, oldName, newName);
    });
  },

  checkIfScriptExists: async ({ page }, use) => {
    await use(async (scriptName: string): Promise<boolean> => {
      return await checkIfExplorerItemExists(page, SCRIPT_EXPLORER_DATA_TESTID_PREFIX, scriptName);
    });
  },

  assertScriptExplorerItems: async ({ page }, use) => {
    await use(async (expected: string[]) => {
      await assertExplorerItems(page, SCRIPT_EXPLORER_DATA_TESTID_PREFIX, expected);
    });
  },

  clickScriptByIndex: async ({ page }, use) => {
    await use(async (index: number): Promise<Locator> => {
      return await clickNodeByIndex(page, SCRIPT_EXPLORER_DATA_TESTID_PREFIX, index);
    });
  },

  selectMultipleScriptNodes: async ({ page }, use) => {
    await use(async (indices: number[]): Promise<Locator[]> => {
      return await selectMultipleNodes(page, SCRIPT_EXPLORER_DATA_TESTID_PREFIX, indices);
    });
  },

  assertScriptNodesSelection: async ({ page }, use) => {
    await use(async (expectedSelectedIndices: number[]) => {
      await assertScriptNodesSelection(
        page,
        SCRIPT_EXPLORER_DATA_TESTID_PREFIX,
        expectedSelectedIndices,
      );
    });
  },

  deselectAllScripts: async ({ page, getAllScriptNodes }, use) => {
    await use(async () => {
      const allScriptNodes = await getAllScriptNodes();

      // First check that there is a selection in the first place, to let the
      // dev know if the fixture is not used correctly
      const selectedNode = (await allScriptNodes.all()).find((node) =>
        isExplorerTreeNodeSelected(node),
      );
      if (!selectedNode) {
        throw new Error('No script nodes are selected');
      }

      // Deselect all items using Escape
      await page.keyboard.press('Escape');
    });
  },

  clickScriptNodeMenuItemByName: async ({ page }, use) => {
    await use(async (dbName: string, menuItemName: string) => {
      await clickExplorerTreeNodeMenuItemByName(
        page,
        SCRIPT_EXPLORER_DATA_TESTID_PREFIX,
        dbName,
        menuItemName,
      );
    });
  },
});
