import { expect } from '@playwright/test';

import { test } from '../fixtures/base';

test('Onboarding modal is displayed on page load', async ({ page }) => {
  // Navigate to the application
  await page.goto('/');

  const onboardingModal = page.getByTestId('onboarding-modal');
  const submitButton = page.getByTestId('onboarding-modal-submit-button');
  const showOnboardingButton = page.getByTestId('start-guide-action-onboarding');

  // Check if the onboarding modal is visible on initial load
  await expect(onboardingModal).toBeVisible();

  // Close the modal and verify it's gone
  await submitButton.click();
  await expect(onboardingModal).toBeHidden();

  // Check if the onboarding modal is not visible after reloading
  await page.reload();
  await expect(onboardingModal).toBeHidden();

  // Check if the onboarding modal is visible on clicking the button
  await expect(showOnboardingButton).toBeVisible();
  await showOnboardingButton.click();

  await expect(onboardingModal).toBeVisible();
});
