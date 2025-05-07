import { expect, mergeTests } from '@playwright/test';

import { test as base } from '../fixtures/base';
import { test as startGuideTest } from '../fixtures/start-guide';
import { test as whatsNewModalTest } from '../fixtures/whats-new-modal';

const test = mergeTests(whatsNewModalTest, base, startGuideTest);

test('Onboarding modal is displayed on page load', async ({ page, onboardingAction }) => {
  // Navigate to the application
  await page.goto('/');

  const onboardingModal = page.getByTestId('onboarding-modal');
  const submitButton = page.getByTestId('onboarding-modal-submit-button');

  // Check if the onboarding modal is visible on initial load
  await expect(onboardingModal).toBeVisible();

  // Close the modal and verify it's gone
  await submitButton.click();
  await expect(onboardingModal).toBeHidden();

  // Check if the onboarding modal is not visible after reloading
  await page.reload();
  await expect(onboardingModal).toBeHidden();

  // Check if the onboarding modal is visible on clicking the button
  await onboardingAction.click();

  await expect(onboardingModal).toBeVisible();
});

test('Onboarding modal is displayed without version notification', async ({
  page,
  newVersionAlert,
}) => {
  // Navigate to the application
  await page.goto('/');

  const onboardingModal = page.getByTestId('onboarding-modal');
  const submitButton = page.getByTestId('onboarding-modal-submit-button');

  // Check if the onboarding modal is visible
  await expect(onboardingModal).toBeVisible();

  // Check that the version notification is not visible
  await expect(newVersionAlert).toBeHidden();

  // Close the onboarding modal
  await submitButton.click();

  // Verify that the version notification is still not visible
  await expect(newVersionAlert).toBeHidden();

  // Reload the page
  await page.reload();

  // Verify that the version notification is not visible after reload
  await expect(newVersionAlert).toBeHidden();

  // Verify that the onboarding modal is not visible after reload
  await expect(onboardingModal).toBeHidden();
});
