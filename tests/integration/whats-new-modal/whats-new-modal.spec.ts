/* eslint-disable no-playwright-page-methods */
import { expect, mergeTests } from '@playwright/test';

import { test as base } from '../fixtures/base';
import { test as whatsNewModalTest } from '../fixtures/whats-new-modal';
import { setOnboardingShown, setVersionShown } from '../utils';

const test = mergeTests(whatsNewModalTest, base);

test("Check if the 'What's New' alert is shown when the app is loaded for the first time", async ({
  page,
  newVersionAlert,
  newVersionAlertCloseButton,
}) => {
  await setOnboardingShown(page);

  await setVersionShown(page, '0.0.0');

  // Navigate to the application
  await page.goto('/');

  await expect(newVersionAlert).toBeVisible();

  // Check if the alert is visible after reloading
  await page.goto('/');
  await expect(newVersionAlert).toBeVisible();

  // Close the alert
  await newVersionAlertCloseButton.click();
  await expect(newVersionAlert).toBeHidden();
  // Reload the page
  await page.goto('/');

  // Check if the alert is not visible after reloading
  await expect(newVersionAlert).toBeHidden();
});

test('Open the "What\'s New" modal and verify its content', async ({
  page,
  whatsNewModal,
  whatsNewModalContent,
  newVersionAlertOpenButton,
  whatsNewModalSubmitButton,
}) => {
  await setOnboardingShown(page);
  await setVersionShown(page, '0.0.0');

  // Navigate to the application
  await page.goto('/');

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
  await setOnboardingShown(page);
  // Set local storage to simulate a previous version
  await setVersionShown(page, '0.0.0');

  // Navigate to the application
  await page.goto('/');

  // Check if the new version alert is visible
  await expect(newVersionAlert).toBeVisible();

  // Check if the alert is visible after reloading
  await page.goto('/');
  await expect(newVersionAlert).toBeVisible();

  // Click the cancel button
  await newVersionAlertCancelButton.click();

  // Verify the alert is hidden
  await expect(newVersionAlert).toBeHidden();

  // Reload the page and wait for load
  await page.goto('/');

  // Verify the alert does not reappear after reload
  await expect(newVersionAlert).toBeHidden();
});

test('Close button hides the new version alert and does not reappear after reload', async ({
  page,
  newVersionAlert,
  newVersionAlertCloseButton,
}) => {
  await setOnboardingShown(page);
  // Set local storage to simulate a previous version
  await setVersionShown(page, '0.0.0');

  // Navigate to the application
  await page.goto('/');

  // Check if the new version alert is visible
  await expect(newVersionAlert).toBeVisible();

  // Click the close button
  await newVersionAlertCloseButton.click();

  // Verify the alert is hidden
  await expect(newVersionAlert).toBeHidden();

  // Reload the page and wait for load
  await page.goto('/');

  // Verify the alert does not reappear after reload
  await expect(newVersionAlert).toBeHidden();
});
