import { expect, mergeTests } from '@playwright/test';

import { test as baseTest } from '../fixtures/page';
import { test as QueryEditorTest } from '../fixtures/query-editor';
import { test as settingsTest } from '../fixtures/settings';
import { test as spotlightTest } from '../fixtures/spotlight';

const test = mergeTests(baseTest, spotlightTest, settingsTest, QueryEditorTest);

test('Open settings page using spotlight menu', async ({
  settingsPage,
  openSettingsViaSpotlight,
}) => {
  // Check settings page is not attached
  expect(settingsPage).not.toBeAttached;

  // Open settings via spotlight menu
  await openSettingsViaSpotlight();

  // Verify the settings page is visible
  await expect(settingsPage).toBeVisible();
});

test('Open new query from settings page', async ({
  queryEditor,
  openSettings,
  createQueryViaSpotlight,
}) => {
  // Open settings page
  const settingsPage = await openSettings();

  // Verify query editor is not visible
  await expect(queryEditor).toBeHidden();

  // Open new query from settings page
  await createQueryViaSpotlight();

  // Check settings page is not attached
  expect(settingsPage).not.toBeAttached;

  // Verify query editor is visible
  await expect(queryEditor).toBeVisible();
});
