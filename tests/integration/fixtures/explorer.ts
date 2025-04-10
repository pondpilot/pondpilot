import { test as base, expect } from '@playwright/test';

type ExplorerFixtures = {
  openQueryFromExplorer: (queryName: string) => Promise<void>;
  renameQueryInExplorer: (oldName: string, newName: string) => Promise<void>;
  openFileFromExplorer: (fileName: string) => Promise<void>;
  assertExplorerItems: (expected: string[]) => Promise<void>;
};

export const test = base.extend<ExplorerFixtures>({
  openQueryFromExplorer: async ({ page }, use) => {
    await use(async (queryName: string) => {
      const queriesList = page.locator('#queries-list');
      const queryItem = queriesList.locator('p', { hasText: queryName });
      await queryItem.click();
    });
  },

  renameQueryInExplorer: async ({ page }, use) => {
    await use(async (oldName: string, newName: string) => {
      // Find the query item in the explorer
      const queryItem = page.getByTestId(`query-list-item-${oldName}`);

      // Double-click to initiate rename
      await queryItem.dblclick();

      // Find and fill the rename input
      const renameInput = page.getByTestId(`query-list-item-${oldName}-rename-input`);

      await expect(renameInput).toBeVisible();

      await renameInput.fill(newName);

      // Press Enter to confirm
      await page.keyboard.press('Enter');

      // Wait for the renamed query to appear
      await page.getByTestId(`query-list-item-${newName}.sql`).waitFor();
    });
  },

  openFileFromExplorer: async ({ page }, use) => {
    await use(async (fileName: string) => {
      const fileItem = page.getByTestId(`query-list-item-${fileName}`);
      await fileItem.click();
    });
  },

  assertExplorerItems: async ({ page }, use) => {
    await use(async (expected: string[]) => {
      const explorerItems = page.locator('[data-testid^="query-list-item-"]');

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
