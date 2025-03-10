import { test, expect } from '@playwright/test';

test.describe('Queries', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/');
    await page.waitForSelector('[data-app-ready="true"]', { state: 'attached' });
  });

  test('Create and run simple query', async ({ page }) => {
    /* Create a new query */
    await page.click('data-testid=add-query-button');

    /* Fill the query editor */
    await page.fill('.cm-content', 'select 1');

    /* Run the query */
    await page.click('data-testid=run-query-button');

    /* Check if the query ran successfully */
    await expect(page.getByText('Query ran successfully')).toBeVisible();

    /* Check if the result is correct */
    await expect(page.getByTestId('cell-1-0')).toHaveText('1');
  });
});
