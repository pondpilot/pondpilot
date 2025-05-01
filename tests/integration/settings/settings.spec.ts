import { expect, mergeTests } from '@playwright/test';

import { test as baseTest } from '../fixtures/page';
import { test as ScriptEditorTest } from '../fixtures/script-editor';
import { test as settingsTest } from '../fixtures/settings';
import { test as spotlightTest } from '../fixtures/spotlight';

const test = mergeTests(baseTest, spotlightTest, settingsTest, ScriptEditorTest);

test('Open settings page using spotlight menu', async ({
  settingsPage,
  openSettingsViaSpotlight,
}) => {
  // Check settings page is not attached
  await expect(settingsPage).not.toBeAttached();

  // Open settings via spotlight menu
  await openSettingsViaSpotlight();

  // Verify the settings page is visible
  await expect(settingsPage).toBeVisible();
});

test('Open new script from settings page', async ({
  scriptEditor,
  openSettings,
  createScriptViaSpotlight,
}) => {
  // Open settings page
  const settingsPage = await openSettings();

  // Verify script editor is not visible
  await expect(scriptEditor).toBeHidden();

  // Open new script from settings page
  await createScriptViaSpotlight();

  // Check settings page is not attached
  await expect(settingsPage).not.toBeAttached();

  // Verify script editor is visible
  await expect(scriptEditor).toBeVisible();
});

test('Close settings page using close button', async ({ settingsPage, openSettings }) => {
  // Open settings page
  await openSettings();

  // Verify the settings page is visible
  await expect(settingsPage).toBeVisible();

  // Close settings page using close button
  const closeButton = settingsPage.getByTestId('settings-page-close-button');
  await closeButton.click();

  // Check settings page is not attached
  await expect(settingsPage).not.toBeAttached();
});
