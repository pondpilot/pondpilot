import { expect } from '@playwright/test';

import { test } from '../fixtures/page';

test('Browser unsupported', async ({ page, browserName }) => {
  // eslint-disable-next-line playwright/no-conditional-in-test
  if (browserName !== 'chromium') {
    // eslint-disable-next-line playwright/no-conditional-expect
    await expect(page.getByTestId('browser-not-supported')).toBeVisible();

    await page.setViewportSize({ width: 991, height: 800 });
    // eslint-disable-next-line playwright/no-conditional-expect
    await expect(page.getByTestId('browser-not-supported')).toBeVisible();
    // eslint-disable-next-line playwright/no-conditional-expect
    await expect(page.getByTestId('desktop-only')).not.toBeAttached();
  }
});
