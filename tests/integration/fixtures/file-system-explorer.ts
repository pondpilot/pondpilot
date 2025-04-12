import { test as base, expect } from '@playwright/test';

type FileSystemExplorerFixtures = {
  openFileFromExplorer: (fileName: string) => Promise<void>;
  assertFileExplorerItems: (expected: string[]) => Promise<void>;
};

export const test = base.extend<FileSystemExplorerFixtures>({
  openFileFromExplorer: async ({ page }, use) => {
    await use(async (fileName: string) => {
      const fileItem = page.getByTestId(`script-explorer-tree-item-${fileName}`);
      await fileItem.click();
    });
  },

  assertFileExplorerItems: async ({ page }, use) => {
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
