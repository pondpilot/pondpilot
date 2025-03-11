import { test, expect } from '@playwright/test';

test.describe('Queries', () => {
  test.beforeEach(async ({ page }) => {
    /**
     * Load the app and wait for it to be ready
     */
    await page.goto('http://localhost:5173/');
    await page.waitForSelector('[data-app-ready="true"]', { state: 'attached' });

    /* Create a new query */
    await page.click('data-testid=add-query-button');

    /* Fill the query editor */
    await page.fill('.cm-content', 'select 1');

    expect(page.locator('.cm-content')).toContainText('select 1');
  });

  test('Create and run simple query', async ({ page }) => {
    /* Run the query */
    await page.click('data-testid=run-query-button');

    /* Check if the query ran successfully */
    await expect(page.getByText('Query ran successfully')).toBeVisible();

    /* Check if the result is correct */
    await expect(page.getByTestId('cell-1-0')).toHaveText('1');
  });

  test.describe('Query auto-save', () => {
    test('Close and reopen query', async ({ page }) => {
      /* Find the active tab */
      const activeTab = page.locator('[data-active="true"]');

      /* Click the delete button within the active tab */
      await activeTab.locator('[data-testid="close-tab-button"]').click();

      /* Find the query item with text "query.sql" */

      const queriesList = page.locator('#queries-list');
      const queryItem = queriesList.locator('p', { hasText: 'query.sql' });
      await queryItem.click();

      /* Verify that the first query content was autosaved */
      await expect(page.locator('.cm-content')).toContainText('select 1');
    });

    test.describe('Switch between tabs', () => {
      /**
       * Create a second empty query before test (opens a new tab)
       */
      test.beforeEach(async ({ page }) => {
        /* Create a second query */
        await page.click('data-testid=add-query-button');

        /* Expect the second query is acive and the content is empty */
        await expect(page.locator('.cm-content')).toContainText('');
      });

      test('Switching in tabs pane', async ({ page }) => {
        /* Switch back to the first query tab */
        const tabsList = page.locator('[data-testid="tabs-list"]');
        const firstTab = tabsList.locator('div').nth(0);
        await firstTab.click();

        /* Verify that the first query content was autosaved */
        await expect(page.locator('.cm-content')).toContainText('select 1');
      });

      test('Switching in query explorer', async ({ page }) => {
        /* Switch back to the first query tab */
        const queriesList = page.locator('#queries-list');

        /* Find the query item with text "query.sql" */
        const queryItem = queriesList.locator('p', { hasText: 'query.sql' });
        await queryItem.click();
        /* Verify that the first query content was autosaved */
        await expect(page.locator('.cm-content')).toContainText('select 1');
      });
    });
  });
});
