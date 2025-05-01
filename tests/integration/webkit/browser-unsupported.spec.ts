import { expect } from '@playwright/test';

import { test } from '../fixtures/page';

test('Browser unsupported', async ({ page, browserName }) => {
  // eslint-disable-next-line playwright/no-conditional-in-test
  if (browserName !== 'chromium') {
    // eslint-disable-next-line playwright/no-conditional-expect
    await expect(page.locator('[data-testid="browser-not-supported"]')).toBeVisible();
  }
});
