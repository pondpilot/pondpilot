import { test as base, expect, Locator } from '@playwright/test';

type FileSystemExplorerFixtures = {
  openFileFromExplorer: (fileName: string) => Promise<void>;
  assertFileExplorerItems: (expected: string[]) => Promise<void>;
  getAllFileNodes: () => Promise<Locator>;
};

export const test = base.extend<FileSystemExplorerFixtures>({
  openFileFromExplorer: async ({ page }, use) => {
    await use(async (fileName: string) => {
      const fileItem = page.getByTestId('file-system-explorer').getByText(fileName);
      await fileItem.click();
    });
  },

  getAllFileNodes: async ({ page }, use) => {
    await use(async (): Promise<Locator> => {
      // Find all file explorer nodes
      return page.getByTestId(/^file-system-explorer-tree-item-.*-node$/);
    });
  },

  assertFileExplorerItems: async ({ getAllFileNodes }, use) => {
    await use(async (expected: string[]) => {
      const explorerItems = await getAllFileNodes();

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
