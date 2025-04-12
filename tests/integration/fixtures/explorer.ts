import { test as base, expect } from '@playwright/test';

type ExplorerFixtures = {
  openScriptFromExplorer: (scriptName: string) => Promise<void>;
  renameScriptInExplorer: (oldName: string, newName: string) => Promise<void>;
  openFileFromExplorer: (fileName: string) => Promise<void>;
  assertExplorerItems: (expected: string[]) => Promise<void>;
};

export const test = base.extend<ExplorerFixtures>({
  openScriptFromExplorer: async ({ page }, use) => {
    await use(async (scriptName: string) => {
      const scriptList = page.getByTestId('script-explorer');
      const scriptItem = scriptList.locator('p', { hasText: scriptName });
      await scriptItem.click();
    });
  },

  renameScriptInExplorer: async ({ page }, use) => {
    await use(async (oldName: string, newName: string) => {
      // Find the script item in the explorer
      const scriptItem = page.getByTestId(`script-explorer-tree-item-${oldName}`);

      // Double-click to initiate rename
      await scriptItem.dblclick();

      // Find and fill the rename input
      const renameInput = page.getByTestId(`script-explorer-tree-item-${oldName}-rename-input`);

      await expect(renameInput).toBeVisible();

      await renameInput.fill(newName);

      // Press Enter to confirm
      await page.keyboard.press('Enter');

      // Wait for the renamed script to appear
      await page.getByTestId(`script-explorer-tree-item-${newName}.sql`).waitFor();
    });
  },

  openFileFromExplorer: async ({ page }, use) => {
    await use(async (fileName: string) => {
      const fileItem = page.getByTestId(`script-explorer-tree-item-${fileName}`);
      await fileItem.click();
    });
  },

  assertExplorerItems: async ({ page }, use) => {
    await use(async (expected: string[]) => {
      const explorerItems = page.locator('[data-testid^="script-explorer-tree-item-"]');

      // Check if the number of items matches
      await expect(explorerItems).toHaveCount(expected.length);

      // Check if each item matches the expected names
      for (let i = 0; i < expected.length; i += 1) {
        const item = explorerItems.nth(i);
        await expect(item).toHaveText(expected[i]);
      }
    });
  },
});
