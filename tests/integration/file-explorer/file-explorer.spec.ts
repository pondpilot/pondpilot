import { execSync } from 'child_process';

import { expect, mergeTests } from '@playwright/test';

import { createFile } from '../../utils';
import { test as dbExplorerTest } from '../fixtures/db-explorer';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as baseTest } from '../fixtures/page';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as spotlightTest } from '../fixtures/spotlight';
import { test as storageTest } from '../fixtures/storage';
import { test as tabTest } from '../fixtures/tab';
import { test as testTmpTest } from '../fixtures/test-tmp';

const test = mergeTests(
  baseTest,
  scriptExplorerTest,
  tabTest,
  storageTest,
  filePickerTest,
  testTmpTest,
  fileSystemExplorerTest,
  spotlightTest,
  dbExplorerTest,
);

test('File should be deselected after creating script from it', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  createScriptFromFileExplorer,
  assertFileExplorerItems,
  clickFileByName,
  getFileNodeByName,
  createScriptViaSpotlight,
}) => {
  // Create and add a test file
  const testFile = testTmp.join('test_selection.csv');
  const testFileContent = 'col\ntest_value';
  createFile(testFile, testFileContent);
  await storage.uploadFile(testFile, 'test_selection.csv');
  await filePicker.selectFiles(['test_selection.csv']);
  await addFileButton.click();

  // Verify the file was added
  await assertFileExplorerItems(['test_selection']);

  // Click on the file to select it
  await clickFileByName('test_selection');

  // Check that the file is selected (has data-selected="true")
  const fileNode = await getFileNodeByName('test_selection');
  // Select the file node
  fileNode.click();
  // Check that the file is selected (data-selected="true")
  await expect(fileNode).toHaveAttribute('data-selected', 'true');

  // Create a script from the file
  await createScriptFromFileExplorer('test_selection');
  // Check that the file is now deselected (data-selected changed to "false" or is absent)
  await expect(fileNode).toHaveAttribute('data-selected', 'false');

  // Select the file again
  await clickFileByName('test_selection');
  await expect(fileNode).toHaveAttribute('data-selected', 'true');

  // Create a new script using spotlight and verify file gets deselected
  await createScriptViaSpotlight();

  // Check that the file selection is cleared after creating script via spotlight
  await expect(fileNode).toHaveAttribute('data-selected', 'false');
});

test('DuckDB view should be deselected after creating script via spotlight', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  openDatabaseExplorer,
  assertDBExplorerItems,
  clickDBByName,
  getDBNodeByName,
  createScriptViaSpotlight,
}) => {
  // Create a DuckDB database with a test view
  const dbPath = testTmp.join('test_selection.duckdb');
  execSync(`duckdb "${dbPath}" -c "CREATE VIEW test_view AS SELECT 1 AS value;"`);

  // Upload and add the DuckDB file
  await storage.uploadFile(dbPath, 'test_selection.duckdb');
  await filePicker.selectFiles(['test_selection.duckdb']);
  await addFileButton.click();

  // Switch to DB Explorer and expand the database
  await openDatabaseExplorer();
  await assertDBExplorerItems(['test_selection']);
  await clickDBByName('test_selection');

  // Get the main schema node and click it to expand
  const mainSchema = await getDBNodeByName('main');
  await mainSchema.click();

  // Check that the view is present
  const viewNode = await getDBNodeByName('test_view');
  await expect(viewNode).toBeVisible();

  // Click the view to select it
  await viewNode.click();

  // Check that the view is selected (data-selected="true")
  await expect(viewNode).toHaveAttribute('data-selected', 'true');

  // Create a new script using spotlight
  await createScriptViaSpotlight();

  // Check that the view is deselected after creating the script
  await expect(viewNode).toHaveAttribute('data-selected', 'false');
});

test('Script should be deselected after opening the file', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  assertFileExplorerItems,
  clickFileByName,
  getFileNodeByName,
  getScriptNodeByName,
  createScriptViaSpotlight,
  openSpotlight,
  page,
  spotlight,
}) => {
  // Create and add a test file
  const testFile = testTmp.join('test_selection.csv');
  const testFileContent = 'col\ntest_value';
  createFile(testFile, testFileContent);
  await storage.uploadFile(testFile, 'test_selection.csv');
  await filePicker.selectFiles(['test_selection.csv']);
  await addFileButton.click();

  // Verify the file was added
  await assertFileExplorerItems(['test_selection']);

  // Click on the file to select it
  await clickFileByName('test_selection');

  // Check that the file is selected (has data-selected="true")
  const fileNode = await getFileNodeByName('test_selection');
  // Select the file node
  fileNode.click();
  // Check that the file is selected (data-selected="true")
  await expect(fileNode).toHaveAttribute('data-selected', 'true');

  // Create a new script using spotlight and verify file gets deselected
  await createScriptViaSpotlight();

  // Check that the file selection is cleared after creating script via spotlight
  await expect(fileNode).toHaveAttribute('data-selected', 'false');

  await clickFileByName('test_selection');
  await expect(fileNode).toHaveAttribute('data-selected', 'true');

  const scriptNode = await getScriptNodeByName('query.sql');
  scriptNode.click();

  // Now test the case when searching for the file via spotlight
  // click body
  await page.click('body');
  await openSpotlight({ trigger: 'hotkey' });

  // Type the search term into spotlight
  await page.getByTestId('spotlight-search').fill('test_selection');

  // Wait for the search results to appear
  // eslint-disable-next-line playwright/no-wait-for-selector
  await page.waitForSelector('[data-testid^="spotlight-action-"]');

  // Find and click on the matching result
  await spotlight.getByText('test_selection', { exact: true }).click();

  // Check that the file is deselected after opening it via spotlight
  await expect(scriptNode).toHaveAttribute('data-selected', 'false');
});
