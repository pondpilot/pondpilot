import { expect } from '@playwright/test';
import { test } from '../fixtures/onboarding';

test('Onboarding modal is displayed on page load', async ({
  page,
  closeOnboardingModal,
  openOnboardingModal,
  onboardingModal,
}) => {
  // Navigate to the application
  await page.goto('http://localhost:5173/');

  // Check if the onboarding modal is visible on initial load
  await expect(onboardingModal).toBeVisible();

  // Close the modal and verify it's gone
  await closeOnboardingModal();

  // Check if the onboarding modal is not visible after reloading
  await page.reload();
  await expect(onboardingModal).toBeHidden();

  // Check if the onboarding modal is visible on clicking the button
  await openOnboardingModal();
  await expect(onboardingModal).toBeVisible();
});
