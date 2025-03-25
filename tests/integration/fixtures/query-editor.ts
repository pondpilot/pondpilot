import { test as base, expect } from '@playwright/test';

type QueryEditorFixtures = {
  fillQuery: (content: string) => Promise<void>;
  runQuery: () => Promise<void>;
};

export const test = base.extend<QueryEditorFixtures>({
  fillQuery: async ({ page }, use) => {
    await use(async (content: string) => {
      // Verify the query tab is active
      await expect(
        page.getByTestId('query-editor'),
        'Did you forget to open a query tab before calling this fixture? Use `createQueryAndSwitchToItsTab` or similar fixture first',
      ).toBeVisible({ timeout: 100 });

      await page.fill('.cm-content', content);
      await expect(page.locator('.cm-content')).toContainText(content);
    });
  },

  runQuery: async ({ page }, use) => {
    await use(async () => {
      // Verify the query tab is active
      await expect(
        page.getByTestId('query-editor'),
        'Did you forget to open a query tab before calling this fixture? Use `createQueryAndSwitchToItsTab` or similar fixture first',
      ).toBeVisible({ timeout: 100 });

      await page.getByTestId('run-query-button').click();
      await expect(page.getByText('Query ran successfully')).toBeVisible();
    });
  },
});
