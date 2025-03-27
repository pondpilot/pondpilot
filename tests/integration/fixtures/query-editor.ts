import { test as base, expect, Locator } from '@playwright/test';

type QueryEditorFixtures = {
  /**
   * Returns the query editor locator.
   */
  queryEditor: Locator;

  /**
   * Returns the query editor textbox locator.
   */
  queryEditorContent: Locator;

  /**
   * Returns the "Run Query" button locator.
   */
  runQueryButton: Locator;

  fillQuery: (content: string) => Promise<void>;
  runQuery: () => Promise<void>;
};

const QUERY_EDITOR_TIMEOUT = Number(process.env.PLAYWRIGHT_QUERY_EDITOR_TIMEOUT) || 100;

export const test = base.extend<QueryEditorFixtures>({
  queryEditor: async ({ page }, use) => {
    await use(page.getByTestId('query-editor'));
  },

  queryEditorContent: async ({ page }, use) => {
    await use(page.locator('.cm-content'));
  },

  runQueryButton: async ({ page }, use) => {
    await use(page.getByTestId('run-query-button'));
  },

  fillQuery: async ({ queryEditor, queryEditorContent }, use) => {
    await use(async (content: string) => {
      // Verify the query tab is active
      await expect(
        queryEditor,
        'Did you forget to open a query tab before calling this fixture? Use `createQueryAndSwitchToItsTab` or similar fixture first',
      ).toBeVisible({ timeout: QUERY_EDITOR_TIMEOUT });

      await queryEditorContent.fill(content);
      await expect(queryEditorContent).toContainText(content);
    });
  },

  runQuery: async ({ page, queryEditor, runQueryButton }, use) => {
    await use(async () => {
      // Verify the query tab is active
      await expect(
        queryEditor,
        'Did you forget to open a query tab before calling this fixture? Use `createQueryAndSwitchToItsTab` or similar fixture first',
      ).toBeVisible({ timeout: QUERY_EDITOR_TIMEOUT });

      await runQueryButton.click();
      await expect(page.getByText('Query ran successfully')).toBeVisible();
    });
  },
});
