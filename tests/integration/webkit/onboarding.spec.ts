import { expect } from '@playwright/test';

import { test } from '../fixtures/base';
import { waitForAppReady } from '../utils';

// Skip WebKit tests due to Playwright WebKit OPFS limitations
test.skip(({ browserName }) => browserName === 'webkit', 'WebKit tests skipped');

test('Onboarding modal displays in all supported browsers', async ({ page, browserName }) => {
  // eslint-disable-next-line playwright/no-conditional-in-test
  if (browserName !== 'chromium') {
    // eslint-disable-next-line local-rules/no-playwright-page-methods
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // App should initialize properly with fallback mode
    await waitForAppReady(page);

    // Browser not supported page should NOT be shown
    const browserNotSupported = page.getByTestId('browser-not-supported');
    // eslint-disable-next-line playwright/no-conditional-expect
    await expect(browserNotSupported).not.toBeAttached();

    // Onboarding modal should be visible for first-time users
    const onboardingModal = page.getByTestId('onboarding-modal');
    // eslint-disable-next-line playwright/no-conditional-expect
    await expect(onboardingModal).toBeVisible({ timeout: 10000 });
  }
});
