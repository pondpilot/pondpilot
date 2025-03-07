import { test, expect } from '@playwright/test';

test.describe('my test suite', () => {
  test('text about ', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    await page.waitForTimeout(1000);

    await page.click('id=add-query');

    await page.fill('.cm-content', 'select 1');
    await page.waitForTimeout(1000);

    await page.click('data-testid=run-query-button');
    await page.waitForTimeout(1000);

    await expect(page.getByText('Query ran successfully')).toBeVisible();
    // Failed test
    await expect(page.getByText('Error')).toBeVisible();
  });
});
