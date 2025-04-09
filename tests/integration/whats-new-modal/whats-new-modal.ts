import { expect } from '@playwright/test';
import { LOCAL_STORAGE_KEYS } from '@consts/local-storage';
import { test } from '../fixtures/page';

test('Whats new modal is displayed when version is newer', async ({ page }) => {
  // Set up localStorage with old version
  await page.goto('http://localhost:5173/');

  // Set up localStorage with old version
  await page.evaluate(
    (key) => localStorage.setItem(key, 'v0.0.0'),
    LOCAL_STORAGE_KEYS.WHATS_NEW_VERSION_SHOWN,
  );

  // Reload the page to trigger the modal
  await page.reload();

  // Check if the release notes modal is visible
  const whatsNewModal = page.getByTestId('whats-new-modal');
  await expect(whatsNewModal).toBeVisible();

  // Check if content is visible
  await page.getByTestId('whats-new-modal-content').waitFor({ state: 'visible' });

  // Verify the submit button exists
  const submitButton = page.getByTestId('whats-new-modal-submit-button');
  await expect(submitButton).toBeVisible();

  // Close the modal and verify it's gone
  await submitButton.click();
  await expect(whatsNewModal).not.toBeVisible();
});
