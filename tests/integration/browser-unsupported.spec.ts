import { expect } from '@playwright/test';
import { test } from './fixtures/page';

test('Browser unsupported', async ({ page, browserName }) => {
  if (browserName !== 'chromium') {
    expect(await page.locator('[data-testid="browser-not-supported"]').isVisible()).toBe(true);
  }
});
