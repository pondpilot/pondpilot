import { expect } from '@playwright/test';
import { test } from '../fixtures/onboarding';

test('Onboarding modal is not displayed if browser is unsupported', async ({
  page,
  browserName,
  onboardingModal,
}) => {
  // eslint-disable-next-line playwright/no-conditional-in-test
  if (browserName !== 'chromium') {
    await page.goto('/');
    // eslint-disable-next-line playwright/no-conditional-expect
    await expect(onboardingModal).toBeHidden();
  }
});
