import { expect, test } from '@playwright/test';

test('Browser unsupported', async ({ page, browserName }) => {
  await page.goto('http://localhost:5173/');
  if (browserName !== 'chromium') {
    expect(await page.locator('[data-testid="browser-not-supported"]').isVisible()).toBe(true);
  }
});
