import { expect, mergeTests } from '@playwright/test';

import { test as base } from '../fixtures/base';
import { test as whatsNewModalTest } from '../fixtures/whats-new-modal';
import { setOnboardingShown, setVersionShown, waitForAppReady } from '../utils';

const test = mergeTests(whatsNewModalTest, base);

test.beforeEach(async ({ page }) => {
  // await context.grantPermissions(['storage-access']);
  await setOnboardingShown(page);
  await setVersionShown(page, 'v0.0.0', { setOnce: true });

  // Navigate to the application
  // eslint-disable-next-line no-playwright-page-methods
  await page.goto('/');
  await waitForAppReady(page);
});

test("Check if the 'What's New' alert is shown when the app is loaded for the first time", async ({
  page,
  newVersionAlert,
  newVersionAlertCloseButton,
}) => {
  await expect(newVersionAlert).toBeVisible();

  // Check if the alert is visible after reloading
  // eslint-disable-next-line no-playwright-page-methods
  await page.reload();
  await waitForAppReady(page);

  await expect(newVersionAlert).toBeVisible();

  // Close the alert
  await newVersionAlertCloseButton.click();
  await expect(newVersionAlert).toBeHidden();

  // Reload the page
  // eslint-disable-next-line no-playwright-page-methods
  await page.reload();
  await waitForAppReady(page);

  // Check if the alert is not visible after reloading
  await expect(newVersionAlert).toBeHidden();
});

test('Open the "What\'s New" modal and verify its content', async ({
  whatsNewModal,
  whatsNewModalContent,
  newVersionAlertOpenButton,
  whatsNewModalSubmitButton,
}) => {
  // Trigger the "What's New" modal
  await newVersionAlertOpenButton.click();

  // Verify the modal is visible
  await expect(whatsNewModal).toBeVisible();

  // Verify the modal content
  await expect(whatsNewModalContent).toBeVisible();

  // Submit
  await whatsNewModalSubmitButton.click();

  // Verify the modal is no longer visible
  await expect(whatsNewModal).toBeHidden();
});

test('Cancel button hides the new version alert and does not reappear after reload', async ({
  page,
  newVersionAlert,
  newVersionAlertCancelButton,
}) => {
  // Check if the new version alert is visible
  await expect(newVersionAlert).toBeVisible();

  // Check if the alert is visible after reloading
  // eslint-disable-next-line no-playwright-page-methods
  await page.reload();
  await waitForAppReady(page);

  await expect(newVersionAlert).toBeVisible();

  // Click the cancel button
  await newVersionAlertCancelButton.click();

  // Verify the alert is hidden
  await expect(newVersionAlert).toBeHidden();

  // Reload the page and wait for load
  // eslint-disable-next-line no-playwright-page-methods
  await page.reload();
  await waitForAppReady(page);

  // Verify the alert does not reappear after reload
  await expect(newVersionAlert).toBeHidden();
});

test('Close button hides the new version alert and does not reappear after reload', async ({
  page,
  newVersionAlert,
  newVersionAlertCloseButton,
}) => {
  // Check if the new version alert is visible
  await expect(newVersionAlert).toBeVisible();

  // Click the close button
  await newVersionAlertCloseButton.click();

  // Verify the alert is hidden
  await expect(newVersionAlert).toBeHidden();

  // Reload the page and wait for load
  // eslint-disable-next-line no-playwright-page-methods
  await page.reload();
  await waitForAppReady(page);

  // Verify the alert does not reappear after reload
  await expect(newVersionAlert).toBeHidden();
});
