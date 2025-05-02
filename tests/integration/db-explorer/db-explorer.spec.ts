import { execSync } from 'child_process';

import { expect, mergeTests } from '@playwright/test';

import { test as dbExplorerTest } from '../fixtures/db-explorer';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as globalHotkeyTest } from '../fixtures/global-hotkeys';
import { test as baseTest } from '../fixtures/page';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as storageTest } from '../fixtures/storage';
import { test as testTmpTest } from '../fixtures/test-tmp';
import { isExplorerTreeNodeSelected } from '../fixtures/utils/explorer-tree';

const test = mergeTests(
  baseTest,
  fileSystemExplorerTest,
  scriptExplorerTest,
  storageTest,
  filePickerTest,
  testTmpTest,
  dbExplorerTest,
  globalHotkeyTest,
);

test('DuckDB view should be deselected after creating script via spotlight', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  openDatabaseExplorer,
  assertDBExplorerItems,
  clickDBByName,
  pressNewScriptHotkey,
  getDBNodeByName,
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

  // Check that the view is selected
  expect(await isExplorerTreeNodeSelected(viewNode)).toBe(true);

  // Create a new script using spotlight without mouse interactions
  // and verify file gets deselected
  await pressNewScriptHotkey();

  // Check that the view is deselected after creating the script
  expect(await isExplorerTreeNodeSelected(viewNode)).toBe(false);
});
