import { expect, mergeTests } from '@playwright/test';
import { test as baseTest } from '../fixtures/page';
import { test as startGuideTest } from '../fixtures/start-guide';
import { test as queryEditorTest } from '../fixtures/query-editor';
import { test as tabTest } from '../fixtures/tab';
import { test as spotlightTest } from '../fixtures/spotlight';

const test = mergeTests(baseTest, startGuideTest, queryEditorTest, tabTest, spotlightTest);

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
  queryEditor,
  closeActiveTab,
}) => {
  // No query editor is open
  await expect(startGuide).toBeVisible();
  await expect(queryEditor).not.toBeVisible();

  // Open a new query editor
  await newQueryAction.click();
  await expect(startGuide).not.toBeVisible();
  await expect(queryEditor).toBeVisible();

  // Close the query editor
  await closeActiveTab();
  await expect(startGuide).toBeVisible();
  await expect(queryEditor).not.toBeVisible();
});

test('Click go to menu action', async ({ startGuide, goToMenuAction, spotlight }) => {
  // No spotlight is open
  await expect(startGuide).toBeVisible();
  await expect(spotlight).not.toBeVisible();

  // Open the spotlight menu
  await goToMenuAction.click();
  await expect(startGuide).toBeVisible();
  await expect(spotlight).toBeVisible();
});
