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
    await page.goto('/');
    await waitForAppReady(page);

    const onboardingModal = page.getByTestId('onboarding-modal');

    // eslint-disable-next-line playwright/no-conditional-expect
    await expect(onboardingModal).toBeHidden();
  }
});
