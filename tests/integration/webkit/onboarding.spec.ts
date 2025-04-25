import test, { expect } from '@playwright/test';

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
