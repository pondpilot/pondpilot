/* eslint-disable no-playwright-page-methods */
import { expect } from '@playwright/test';

import { test } from '../fixtures/base';

test('Onboarding modal is not displayed if browser is unsupported', async ({
  page,
  browserName,
}) => {
  // eslint-disable-next-line playwright/no-conditional-in-test
  if (browserName !== 'chromium') {
    await page.goto('/');

    const onboardingModal = page.getByTestId('onboarding-modal');

    // eslint-disable-next-line playwright/no-conditional-expect
    await expect(onboardingModal).toBeHidden();
  }
});
