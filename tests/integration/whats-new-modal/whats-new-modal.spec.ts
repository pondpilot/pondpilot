import { expect, mergeTests } from '@playwright/test';

import { test as base } from '../fixtures/base';
import { test as whatsNewModalTest } from '../fixtures/whats-new-modal';
import { setOnboardingShown, setVersionShown, waitForAppReady } from '../utils';

const test = mergeTests(whatsNewModalTest, base);

test.beforeEach(async ({ page }) => {
  await setOnboardingShown(page);
  await setVersionShown(page, 'v0.0.0', { setOnce: true });

  // Navigate to the application
  // eslint-disable-next-line local-rules/no-playwright-page-methods
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
  // eslint-disable-next-line local-rules/no-playwright-page-methods
  await page.reload();
  await waitForAppReady(page);

  await expect(newVersionAlert).toBeVisible();

  // Close the alert
  await newVersionAlertCloseButton.click();
  await expect(newVersionAlert).toBeHidden();

  // Reload the page
  // eslint-disable-next-line local-rules/no-playwright-page-methods
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
  // eslint-disable-next-line local-rules/no-playwright-page-methods
  await page.reload();
  await waitForAppReady(page);

  await expect(newVersionAlert).toBeVisible();

  // Click the cancel button
  await newVersionAlertCancelButton.click();

  // Verify the alert is hidden
  await expect(newVersionAlert).toBeHidden();

  // Reload the page and wait for load
  // eslint-disable-next-line local-rules/no-playwright-page-methods
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
  // eslint-disable-next-line local-rules/no-playwright-page-methods
  await page.reload();
  await waitForAppReady(page);

  // Verify the alert does not reappear after reload
  await expect(newVersionAlert).toBeHidden();
});

test('Version list renders multiple versions when modal opens', async ({
  newVersionAlertOpenButton,
  whatsNewModal,
  whatsNewVersionList,
  page,
}) => {
  await newVersionAlertOpenButton.click();
  await expect(whatsNewModal).toBeVisible();

  // Verify the version list is visible and contains multiple items
  await expect(whatsNewVersionList).toBeVisible();

  const versionItems = whatsNewVersionList.getByRole('button');
  await expect(versionItems).toHaveCount(3);

  // Verify version tags are displayed
  await expect(page.getByTestId('whats-new-version-item-v1.0.0')).toBeVisible();
  await expect(page.getByTestId('whats-new-version-item-v0.9.0')).toBeVisible();
  await expect(page.getByTestId('whats-new-version-item-v0.5.0')).toBeVisible();
});

test('Clicking a version in the list updates the detail pane content', async ({
  newVersionAlertOpenButton,
  whatsNewModal,
  whatsNewModalContent,
  page,
}) => {
  await newVersionAlertOpenButton.click();
  await expect(whatsNewModal).toBeVisible();

  // The first version (v1.0.0) should be auto-selected and its content shown
  await expect(whatsNewModalContent).toContainText('Mock feature 1');

  // Click on v0.9.0 to switch content
  await page.getByTestId('whats-new-version-item-v0.9.0').click();

  // Verify the detail pane updates with the v0.9.0 release content
  await expect(whatsNewModalContent).toContainText('Older feature');

  // Click on v0.5.0
  await page.getByTestId('whats-new-version-item-v0.5.0').click();

  // Verify the detail pane updates with the v0.5.0 release content
  await expect(whatsNewModalContent).toContainText('Initial feature');
});

test('"New" badge appears on versions newer than last-seen version', async ({
  newVersionAlertOpenButton,
  whatsNewModal,
  page,
}) => {
  // The beforeEach sets lastSeenVersion to v0.0.0, so all versions should have a "new" badge
  await newVersionAlertOpenButton.click();
  await expect(whatsNewModal).toBeVisible();

  // All three versions should have new badges since lastSeenVersion is v0.0.0
  await expect(page.getByTestId('whats-new-badge-v1.0.0')).toBeVisible();
  await expect(page.getByTestId('whats-new-badge-v0.9.0')).toBeVisible();
  await expect(page.getByTestId('whats-new-badge-v0.5.0')).toBeVisible();
});
