import { expect } from '@playwright/test';

import { test } from '../fixtures/page';

// Skip WebKit tests due to Playwright WebKit OPFS limitations
// Real Safari/WebKit works fine in production, but Playwright WebKit environment
// doesn't support OPFS which is required for DuckDB initialization
test.skip(({ browserName }) => browserName === 'webkit', 'WebKit tests skipped');

test('Browser fallback mode works', async ({ page, browserName }) => {
  // eslint-disable-next-line playwright/no-conditional-in-test
  if (browserName !== 'chromium') {
    // With fallback mode, all browsers should now work
    // Check that browser-not-supported page is NOT shown
    // eslint-disable-next-line playwright/no-conditional-expect
    await expect(page.getByTestId('browser-not-supported')).not.toBeAttached();

    // Verify the app loads properly
    // eslint-disable-next-line playwright/no-conditional-expect
    await expect(page.getByTestId('app-state')).toHaveAttribute('data-app-load-state', 'ready', {
      timeout: 10000,
    });
  }
});
