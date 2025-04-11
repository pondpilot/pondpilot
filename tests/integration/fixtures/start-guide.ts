import { test as base, Locator } from '@playwright/test';

type StartGuideFixtures = {
  startGuide: Locator;
  newQueryAction: Locator;
  importQueryAction: Locator;
  addFileAction: Locator;
  addFolderAction: Locator;
  addDuckDBAction: Locator;
  goToMenuAction: Locator;
};

export const test = base.extend<StartGuideFixtures>({
  startGuide: async ({ page }, use) => {
    await use(page.getByTestId('start-guide'));
  },

  newQueryAction: async ({ page }, use) => {
    await use(page.getByTestId('start-guide-action-new-query'));
  },

  importQueryAction: async ({ page }, use) => {
    await use(page.getByTestId('start-guide-action-import-query'));
  },

  addFileAction: async ({ page }, use) => {
    await use(page.getByTestId('start-guide-action-add-file'));
  },

  addFolderAction: async ({ page }, use) => {
    await use(page.getByTestId('start-guide-action-add-folder'));
  },

  addDuckDBAction: async ({ page }, use) => {
    await use(page.getByTestId('start-guide-action-add-duckdb-db'));
  },

  goToMenuAction: async ({ page }, use) => {
    await use(page.getByTestId('start-guide-action-go-to-menu'));
  },
});
