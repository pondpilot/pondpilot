import test, { expect } from '@playwright/test';

test('Onboarding modal is displayed on page load', async ({ page }) => {
  // Navigate to the application
  await page.goto('http://localhost:5173/');

  // Check if the onboarding modal is visible
  const onboardingModal = page.getByTestId('onboarding-modal');
  await expect(onboardingModal).toBeVisible();

  // Verify the submit button exists
  const submitButton = page.getByTestId('onboarding-modal-submit-button');
  await expect(submitButton).toBeVisible();

  // Close the modal and verify it's gone
  await submitButton.click();
  await expect(onboardingModal).toBeHidden();
});
