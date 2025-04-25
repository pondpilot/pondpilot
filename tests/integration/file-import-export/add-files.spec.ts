import { mergeTests, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import { DUCKDB_FORBIDDEN_ATTACHED_DB_NAMES } from '@utils/duckdb/identifier';
import { test as baseTest } from '../fixtures/page';
import { test as storageTest } from '../fixtures/storage';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as testTmpTest } from '../fixtures/test-tmp';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as dataViewTest } from '../fixtures/data-view';
import { test as spotlightTest } from '../fixtures/spotlight';
import { test as scriptEditor } from '../fixtures/script-editor';
import { test as dbExplorerTest } from '../fixtures/db-explorer';
import { createFile } from '../../utils';

const test = mergeTests(
  baseTest,
  storageTest,
  filePickerTest,
  testTmpTest,
  fileSystemExplorerTest,
  dataViewTest,
  spotlightTest,
  scriptEditor,
  dbExplorerTest,
);

test('should add csv files and folders', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  clickFileByName,
  openFileFromExplorer,
  assertDataTableMatches,
  assertFileExplorerItems,
  addDirectoryViaSpotlight,
  reloadPage,
}) => {
  // Test single file
  const test1 = testTmp.join('test1.csv');
  createFile(test1, 'id,name\n1,test1\n2,test2');
  // Prepare test files
  await storage.uploadFile(test1, 'test1.csv');
  // Patch the file picker
  await filePicker.selectFiles(['test1.csv']);
  // Click the add file button
  await addFileButton.click();
  // Verify explorer items
  await assertFileExplorerItems(['test1']);
  // Verify file viewer
  await openFileFromExplorer('test1');
  await assertDataTableMatches({ id: [1, 2], name: ['test1', 'test2'] });

  // Test multiple files
  const test2 = testTmp.join('test2.csv');
  createFile(test2, 'col\ntest2');
  const test3 = testTmp.join('test3.csv');
  createFile(test3, 'col\ntest3');
  // Prepare test files
  await storage.uploadFile(test2, 'select_two_files/test2.csv');
  await storage.uploadFile(test3, 'select_two_files/test3.csv');
  // Patch the file picker
  await filePicker.selectFiles(['select_two_files/test2.csv', 'select_two_files/test3.csv']);
  // Click the add file button
  await addFileButton.click();
  // Verify explorer items
  await assertFileExplorerItems(['test1', 'test2', 'test3']);
  // Verify file viewer
  await openFileFromExplorer('test2');
  await assertDataTableMatches({ col: ['test2'] });
  await openFileFromExplorer('test3');
  await assertDataTableMatches({ col: ['test3'] });

  // Test directory
  const testDirFile1 = testTmp.join('dir', 'test_dir_file1.csv');
  createFile(testDirFile1, 'col\ntest_dir_file1');
  const testDirFile2 = testTmp.join('dir', 'test_dir_file2.csv');
  createFile(testDirFile2, 'col\ntest_dir_file2');
  // Upload directory
  await storage.uploadDir(testTmp.join('dir'), 'test_dir');
  // Patch the file picker
  await filePicker.selectDir('test_dir');
  // Click the add folder button
  await addDirectoryViaSpotlight();
  // Verify explorer items
  await assertFileExplorerItems(['test_dir', 'test1', 'test2', 'test3']);
  // Click on the newly added folder to expand it
  await clickFileByName('test_dir');

  // Verify explorer items
  await assertFileExplorerItems([
    'test_dir',
    'test_dir_file1',
    'test_dir_file2',
    'test1',
    'test2',
    'test3',
  ]);

  // Verify file viewer
  await openFileFromExplorer('test_dir_file1');
  await assertDataTableMatches({ col: ['test_dir_file1'] });
  await openFileFromExplorer('test_dir_file2');
  await assertDataTableMatches({ col: ['test_dir_file2'] });

  // Test remove files
  await storage.removeEntry('test1.csv');
  await storage.removeEntry('test_dir');
  // Reload the page
  await reloadPage();
  // Verify explorer items
  await assertFileExplorerItems(['test2', 'test3']);
});

test('should handle duckdb files with reserved names correctly', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  assertDBExplorerItems,
  clickDBByName,
  getDBNodeByName,
  assertDataTableMatches,
  openDatabaseExplorer,
  clickDBNodeMenuItemByName,
}) => {
  // Create a DuckDB database with a simple view
  const dbPath = testTmp.join('test.db');
  execSync(`duckdb "${dbPath}" -c "CREATE VIEW test_view AS SELECT 1 AS value;"`);

  // List of names to test - both reserved and non-reserved
  const testNames = DUCKDB_FORBIDDEN_ATTACHED_DB_NAMES.slice();
  // Add one duckdb reserved identifier that is allowed as quoted in attach,
  // and one regular name
  testNames.push('view', 'regular');

  // Open the DB explorer
  await openDatabaseExplorer();

  for (const name of testNames) {
    const testDbPath = testTmp.join(`${name}.duckdb`);

    // Copy the test database to the test name
    fs.copyFileSync(dbPath, testDbPath);

    // Upload the database file
    await storage.uploadFile(testDbPath, `${name}.duckdb`);

    // Patch the file picker
    await filePicker.selectFiles([`${name}.duckdb`]);

    // Click the add file button
    await addFileButton.click();

    // Get the expected resulting database name. For strictly reserved names,
    // we expect them to be renamed with an underscore prefix.
    const expectedDbDisplayName = DUCKDB_FORBIDDEN_ATTACHED_DB_NAMES.includes(name)
      ? `${name}_1 (${name})`
      : name;

    // Non-reserved names should remain as is
    await assertDBExplorerItems([expectedDbDisplayName]);

    // Expand the database by clicking on it
    await clickDBByName(expectedDbDisplayName);

    // Get the main schema node and click it
    const mainSchema = await getDBNodeByName('main');
    await mainSchema.click();

    // Check that the view is present
    const viewNode = await getDBNodeByName('test_view');
    await expect(viewNode).toBeVisible();

    // Open the view by clicking on it
    await viewNode.click();
    // Check that the view is opened and contains the expected data
    await assertDataTableMatches({ value: ['1'] });

    // Delete the database from the DB explorer
    await clickDBNodeMenuItemByName(expectedDbDisplayName, 'Delete');
    // Confirm the deletion
    await assertDBExplorerItems([]);
  }
});
