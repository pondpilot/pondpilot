import { expect, mergeTests } from '@playwright/test';

import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as spotlightTest } from '../fixtures/spotlight';
import { test as startGuideTest } from '../fixtures/start-guide';
import { test as tabTest } from '../fixtures/tab';
import { test as whatsNewModalTest } from '../fixtures/whats-new-modal';

const test = mergeTests(
  baseTest,
  startGuideTest,
  scriptEditorTest,
  tabTest,
  spotlightTest,
  whatsNewModalTest,
);

test('Start guide is visible on first run', async ({
  startGuide,
  newQueryAction,
  importQueryAction,
  addFileAction,
  addFolderAction,
  addDuckDBAction,
  goToMenuAction,
}) => {
  await expect(startGuide).toBeVisible();
  await expect(newQueryAction).toBeVisible();
  await expect(importQueryAction).toBeVisible();
  await expect(addFileAction).toBeVisible();
  await expect(addFolderAction).toBeVisible();
  await expect(addDuckDBAction).toBeVisible();
  await expect(goToMenuAction).toBeVisible();
});

test('Click new query action', async ({
  startGuide,
  newQueryAction,
  scriptEditor,
  closeActiveTab,
}) => {
  // No query editor is open
  await expect(startGuide).toBeVisible();
  await expect(scriptEditor).toBeHidden();

  // Open a new query editor
  await newQueryAction.click();
  await expect(startGuide).toBeHidden();
  await expect(scriptEditor).toBeVisible();

  // Close the query editor
  await closeActiveTab();
  await expect(startGuide).toBeVisible();
  await expect(scriptEditor).toBeHidden();
});

test('Click go to menu action', async ({ startGuide, goToMenuAction, spotlight }) => {
  // No spotlight is open
  await expect(startGuide).toBeVisible();
  await expect(spotlight).toBeHidden();

  // Open the spotlight menu
  await goToMenuAction.click();
  await expect(startGuide).toBeVisible();
  await expect(spotlight).toBeVisible();
});

test('Open release notes from Start Guide', async ({
  page,
  releaseNotesAction,
  whatsNewModal,
  whatsNewModalContent,
  whatsNewModalSubmitButton,
}) => {
  // Navigate to the application
  await page.goto('/');

  // Click the "Release Notes" button in the Start Guide
  await releaseNotesAction.click();

  // Verify the "What's New" modal is visible
  await expect(whatsNewModal).toBeVisible();

  // Verify the modal content is loaded
  await expect(whatsNewModalContent).toBeVisible();

  // Close the modal
  await whatsNewModalSubmitButton.click();

  // Verify the modal is no longer visible
  await expect(whatsNewModal).toBeHidden();
});
