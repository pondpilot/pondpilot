/* eslint-disable playwright/no-conditional-in-test */
import { execSync } from 'child_process';
import * as fs from 'fs';

import { mergeTests, expect } from '@playwright/test';
import { DUCKDB_FORBIDDEN_ATTACHED_DB_NAMES } from '@utils/duckdb/identifier';

import { createFile } from '../../utils';
import { test as dataViewTest } from '../fixtures/data-view';
import { test as dbExplorerTest } from '../fixtures/db-explorer';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as baseTest } from '../fixtures/page';
import { test as spotlightTest } from '../fixtures/spotlight';
import { FileSystemNode } from '../models';

const test = mergeTests(baseTest, filePickerTest, dataViewTest, spotlightTest, dbExplorerTest);

test.skip('should add csv files and folders', async ({
  page,
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

  // Wait for the file to appear in the explorer
  await page.waitForSelector(
    '[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]',
    {
      timeout: 5000,
    },
  );

  // Verify explorer items
  await assertFileExplorerItems(['test1']);
  // Verify file viewer
  await openFileFromExplorer('test1');
  await assertDataTableMatches({
    data: [
      ['1', 'test1'],
      ['2', 'test2'],
    ],
    columnNames: ['id', 'name'],
  });

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

  // Wait for the new files to appear
  await page.waitForTimeout(1000);

  // Verify explorer items
  await assertFileExplorerItems(['test1', 'test2', 'test3']);
  // Verify file viewer
  await openFileFromExplorer('test2');
  await assertDataTableMatches({
    data: [['test2']],
    columnNames: ['col'],
  });
  await openFileFromExplorer('test3');
  await assertDataTableMatches({
    data: [['test3']],
    columnNames: ['col'],
  });

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
  await assertDataTableMatches({
    data: [['test_dir_file1']],
    columnNames: ['col'],
  });
  await openFileFromExplorer('test_dir_file2');
  await assertDataTableMatches({
    data: [['test_dir_file2']],
    columnNames: ['col'],
  });

  // Test remove files
  await storage.removeEntry('test1.csv');
  await storage.removeEntry('test_dir');
  // Reload the page
  await reloadPage();
  // Verify explorer items
  await assertFileExplorerItems(['test2', 'test3']);
});

test('should add and read Excel files with multiple sheets', async ({
  setupFileSystem,
  openFileFromExplorer,
  assertDataTableMatches,
  assertFileExplorerItems,
  clickFileMenuItemByName,
  clickFileByName,
  reloadPage,
}) => {
  // Create Excel file with two sheets

  await setupFileSystem([
    {
      type: 'file',
      ext: 'xlsx',
      name: 'test',
      content: [
        {
          name: 'Employees',
          rows: [
            { id: 1, name: 'Alice', department: 'Engineering' },
            { id: 2, name: 'Bob', department: 'Marketing' },
            { id: 3, name: 'Charlie', department: 'Sales' },
          ],
        },
        {
          name: 'Products',
          rows: [
            { product: 'Widget', price: 19.99, stock: 42 },
            { product: 'Gadget', price: 24.99, stock: 27 },
            { product: 'Doohickey', price: 14.99, stock: 15 },
          ],
        },
        {
          name: 'EmptySheet',
          rows: [{}],
        },
      ],
    },
  ] as FileSystemNode[]);

  // Verify excel file itslef is visible
  await assertFileExplorerItems(['test']);

  // Now click on the file to expand it
  await clickFileByName('test');

  // Verify explorer items - should show both sheets as separate files
  await assertFileExplorerItems(['test', 'Employees', 'Products']);

  // Verify first sheet content
  await openFileFromExplorer('Employees');
  await assertDataTableMatches({
    // SheetJS has some issues when saving the header row, it is not
    // recognized as a header by duckdb. So we use skipHeader and default
    // column names that are generated by duckdb.
    data: [
      [1, 'Alice', 'Engineering'],
      [2, 'Bob', 'Marketing'],
      [3, 'Charlie', 'Sales'],
    ],
    columnNames: ['A1', 'B1', 'C1'],
  });

  // Verify second sheet content
  await openFileFromExplorer('Products');
  await assertDataTableMatches({
    // SheetJS has some issues when saving the header row, it is not
    // recognized as a header by duckdb. So we use skipHeader and default
    // column names that are generated by duckdb.
    data: [
      ['Widget', 19.99, 42],
      ['Gadget', 24.99, 27],
      ['Doohickey', 14.99, 15],
    ],
    columnNames: ['A1', 'B1', 'C1'],
  });

  await reloadPage();
  await clickFileByName('test');

  await assertFileExplorerItems(['test', 'Employees', 'Products']);

  // Delete the database from the DB explorer
  await clickFileMenuItemByName('test', 'Delete');

  // Verify no items left in explorer
  await assertFileExplorerItems([]);
});

test('should handle duckdb files with reserved names correctly', async ({
  page,
  addFileButton,
  storage,
  filePicker,
  testTmp,
  assertDBExplorerItems,
  clickDBByName,
  getDBNodeByName,
  assertDataTableMatches,
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

  // No need to open DB explorer, it should already be visible in the unified explorer
  // Wait for the UI to stabilize
  await page.waitForTimeout(1000);

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

    // Wait for the database to be added
    await page.waitForTimeout(2000);

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
    await assertDataTableMatches({
      data: [['1']],
      columnNames: ['value'],
    });

    // Delete the database from the DB explorer
    await clickDBNodeMenuItemByName(expectedDbDisplayName, 'Delete');
    // Confirm the deletion
    await assertDBExplorerItems([]);
  }
});
