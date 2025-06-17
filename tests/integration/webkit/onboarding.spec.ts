import { expect } from '@playwright/test';

import { test } from '../fixtures/base';
import { waitForAppReady } from '../utils';

test('Onboarding modal is not displayed if browser is unsupported', async ({
  page,
  browserName,
}) => {
  // eslint-disable-next-line playwright/no-conditional-in-test
  if (browserName !== 'chromium') {
    // eslint-disable-next-line local-rules/no-playwright-page-methods
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for browser not supported page to render
    const browserNotSupported = page.getByTestId('browser-not-supported');
    await expect(browserNotSupported).toBeVisible({ timeout: 10000 });

    // Now wait for app ready state
    await waitForAppReady(page);

    const onboardingModal = page.getByTestId('onboarding-modal');

    // eslint-disable-next-line playwright/no-conditional-expect
    await expect(onboardingModal).toBeHidden();
  }
});
