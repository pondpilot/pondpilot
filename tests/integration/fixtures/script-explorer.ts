import { test as base, expect, Locator } from '@playwright/test';

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
  assertScriptExplorerItems: (expected: string[]) => Promise<void>;
  selectScriptByIndex: (index: number) => Promise<Locator>;
  selectMultipleScriptNodes: (indices: number[]) => Promise<void>;
  assertScriptNodesSelection: (expectedSelectedIndices: number[]) => Promise<void>;
  deselectAllScripts: () => Promise<void>;
};

export const isScriptNodeSelected = async (scriptNode: Locator): Promise<boolean> => {
  // Check if the script node has the selected attribute
  const isSelected = await scriptNode.getAttribute('data-selected');
  return isSelected === 'true';
};

export const test = base.extend<ScriptExplorerFixtures>({
  scriptExplorer: async ({ page }, use) => {
    await use(page.getByTestId('script-explorer'));
  },

  getAllScriptNodes: async ({ page }, use) => {
    await use(async (): Promise<Locator> => {
      // Find all script explorer nodes
      return page.getByTestId(/^script-explorer-tree-item-.*-node$/);
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

  openScriptFromExplorer: async ({ scriptExplorer }, use) => {
    await use(async (scriptName: string) => {
      const scriptItem = scriptExplorer.locator('p', { hasText: scriptName });
      await scriptItem.click();
    });
  },

  getScriptNodeByName: async ({ getAllScriptNodes }, use) => {
    await use(async (scriptName: string): Promise<Locator> => {
      // Find all script explorer nodes
      const scriptNodes = await getAllScriptNodes();

      // Find the specific node that contains the script name
      return scriptNodes.filter({ hasText: scriptName });
    });
  },

  getScriptNodeByIndex: async ({ getAllScriptNodes }, use) => {
    await use(async (index: number): Promise<Locator> => {
      // Find all script explorer nodes
      const scriptNodes = await getAllScriptNodes();

      // Find the specific node by index
      return scriptNodes.nth(index);
    });
  },

  getScriptNodeById: async ({ page }, use) => {
    await use(async (scriptId: string): Promise<Locator> => {
      return page.getByTestId(`script-explorer-tree-item-${scriptId}-node`);
    });
  },

  getScriptIdByName: async ({ getScriptNodeByName }, use) => {
    await use(async (scriptName: string): Promise<string> => {
      // Find the specific node that contains the script name
      const scriptNode = await getScriptNodeByName(scriptName);

      // it may be off screen, but should be attached
      await expect(scriptNode).toBeAttached();

      // Get the data-value attribute which contains the ID
      const scriptId = await scriptNode.getAttribute('data-value');

      if (!scriptId) {
        throw new Error(`Script with name "${scriptName}" not found or has no ID`);
      }

      return scriptId;
    });
  },

  renameScriptInExplorer: async ({ page, getScriptIdByName, getScriptNodeByName }, use) => {
    await use(async (oldName: string, newName: string) => {
      // Find the script item in the explorer
      const oldNode = await getScriptNodeByName(oldName);
      const oldScriptId = await getScriptIdByName(oldName);

      // Double-click to initiate rename
      await oldNode.dblclick();

      // Find and fill the rename input
      const renameInput = page.getByTestId(`script-explorer-tree-item-${oldScriptId}-rename-input`);

      await expect(renameInput).toBeVisible();

      await renameInput.fill(newName);

      // Press Enter to confirm
      await page.keyboard.press('Enter');

      // Wait for the renamed script to appear
      const renameNode = await getScriptNodeByName(newName);
      await expect(renameNode).toBeVisible();
      await expect(oldNode).toBeHidden();
    });
  },

  assertScriptExplorerItems: async ({ getAllScriptNodes }, use) => {
    await use(async (expected: string[]) => {
      const allScriptNodes = await getAllScriptNodes();

      // Check if the number of items matches
      await expect(allScriptNodes).toHaveCount(expected.length);

      // Check if each item matches the expected names
      for (let i = 0; i < expected.length; i += 1) {
        const item = allScriptNodes.nth(i);
        await expect(item).toHaveText(expected[i]);
      }
    });
  },

  selectScriptByIndex: async ({ getAllScriptNodes }, use) => {
    await use(async (index: number) => {
      const allScriptNodes = await getAllScriptNodes();
      const scriptNode = allScriptNodes.nth(index);
      await allScriptNodes.nth(index).click();
      return scriptNode;
    });
  },

  selectMultipleScriptNodes: async ({ page, getAllScriptNodes }, use) => {
    await use(async (indices: number[]) => {
      const allScriptNodes = await getAllScriptNodes();
      await page.keyboard.down('ControlOrMeta');
      for (const index of indices) {
        await allScriptNodes.nth(index).click();
      }
      await page.keyboard.up('ControlOrMeta');
    });
  },

  assertScriptNodesSelection: async ({ getAllScriptNodes }, use) => {
    await use(async (expectedSelectedIndices: number[]) => {
      const allScriptNodes = await getAllScriptNodes();

      // Check that all items are deselected
      const actualSelection = await Promise.all(
        (await allScriptNodes.all()).map((node) => {
          return isScriptNodeSelected(node);
        }),
      );

      const expectedSelection = actualSelection.every((isSelected, index) => {
        return isSelected
          ? expectedSelectedIndices.includes(index)
          : !expectedSelectedIndices.includes(index);
      });

      expect(expectedSelection).toBe(true);
    });
  },

  deselectAllScripts: async ({ page, getAllScriptNodes }, use) => {
    await use(async () => {
      const allScriptNodes = await getAllScriptNodes();

      // First check that there is a selection in the first place, to let the
      // dev know if the fixture is not used correctly
      const selectedNode = (await allScriptNodes.all()).find((node) => isScriptNodeSelected(node));
      if (!selectedNode) {
        throw new Error('No script nodes are selected');
      }

      // Deselect all items using Escape
      await page.keyboard.press('Escape');
    });
  },
});
