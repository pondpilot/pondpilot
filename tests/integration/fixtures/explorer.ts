import { test as base, expect, Locator } from '@playwright/test';

type ExplorerFixtures = {
  openQueryFromExplorerByIndex: (index: number) => Promise<void>;
  getQueryItemsFromExplorer: () => Promise<Locator>;
  findQueryItemInExplorerByName: (queryName: string) => Promise<Locator>;
  getQueryListContainer: () => Promise<Locator>;
  openQueryFromExplorer: (queryName: string) => Promise<void>;
  renameQueryInExplorer: (oldName: string, newName: string) => Promise<void>;
  selectQueryItemByIndex: (index: number) => Promise<void>;
  selectMultipleQueryItems: (indices: number[]) => Promise<void>;
  deselectAllQueryItems: () => Promise<void>;
  isQueryItemSelected: (index: number) => Promise<boolean>;
};

export const test = base.extend<ExplorerFixtures>({
  selectQueryItemByIndex: async ({ getQueryItemsFromExplorer }, use) => {
    await use(async (index: number) => {
      const queryItems = await getQueryItemsFromExplorer();
      await queryItems.nth(index).click();
    });
  },

  selectMultipleQueryItems: async ({ page, getQueryItemsFromExplorer }, use) => {
    await use(async (indices: number[]) => {
      const queryItems = await getQueryItemsFromExplorer();
      await page.keyboard.down('ControlOrMeta');
      for (const index of indices) {
        await queryItems.nth(index).click();
      }
      await page.keyboard.up('ControlOrMeta');
    });
  },

  deselectAllQueryItems: async ({ page }, use) => {
    await use(async () => {
      await page.keyboard.press('Escape');
    });
  },

  isQueryItemSelected: async ({ getQueryItemsFromExplorer }, use) => {
    await use(async (index: number) => {
      const queryItems = await getQueryItemsFromExplorer();
      const item = queryItems.nth(index);
      const attribute = await item.getAttribute('data-selected');
      return attribute === 'true';
    });
  },
  getQueryListContainer: async ({ page }, use) => {
    await use(async () => {
      const queriesList = page.locator('#queries-list');
      return queriesList;
    });
  },

  getQueryItemsFromExplorer: async ({ getQueryListContainer }, use) => {
    await use(async () => {
      const queriesList = await getQueryListContainer();
      const queryItems = queriesList.getByTestId(/query-list-item/);
      return queryItems;
    });
  },

  openQueryFromExplorerByIndex: async ({ getQueryItemsFromExplorer }, use) => {
    await use(async (index: number) => {
      const queriesList = await getQueryItemsFromExplorer();
      const queryItem = queriesList.nth(index);
      await queryItem.click();
    });
  },

  findQueryItemInExplorerByName: async ({ getQueryListContainer }, use) => {
    await use(async (queryName: string) => {
      const queriesList = await getQueryListContainer();
      const queryItem = queriesList.getByText(queryName);
      return queryItem;
    });
  },

  openQueryFromExplorer: async ({ findQueryItemInExplorerByName }, use) => {
    await use(async (queryName: string) => {
      const queryItem = await findQueryItemInExplorerByName(queryName);
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
});
