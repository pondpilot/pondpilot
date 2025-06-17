import { expect, mergeTests } from '@playwright/test';

import { createFile } from '../../utils';
import { test as dbExplorerTest } from '../fixtures/db-explorer';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as baseTest } from '../fixtures/page';
import { test as storageTest } from '../fixtures/storage';
import { test as testTmpTest } from '../fixtures/test-tmp';
import { test as waitUtilsTest } from '../fixtures/wait-utils';

const test = mergeTests(
  baseTest,
  fileSystemExplorerTest,
  dbExplorerTest,
  testTmpTest,
  waitUtilsTest,
  storageTest,
  filePickerTest,
);

test.describe('Data Explorer Filtering', () => {
  test.beforeEach(async ({ testTmp }) => {
    // Create test files
    await createFile(testTmp.join('test.csv'), 'name,value\ntest1,1\ntest2,2');
    await createFile(testTmp.join('data.json'), '{"test": "data"}');
    await createFile(testTmp.join('report.parquet'), 'dummy parquet data');
    await createFile(testTmp.join('sheet.xlsx'), 'dummy excel data');
    await createFile(testTmp.join('notes.txt'), 'plain text file');
    await createFile(testTmp.join('script.sql'), 'SELECT * FROM test;');
  });

  test('should show quick filter buttons', async ({ page }) => {
    const filterContainer = page.getByTestId('data-explorer-filters');
    await expect(filterContainer).toBeVisible();

    // Check for filter buttons
    await expect(page.getByRole('button', { name: 'Show all' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Files' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Local databases' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remote databases' })).toBeVisible();
  });

  // eslint-disable-next-line playwright/expect-expect
  test('should filter by type when clicking filter buttons', async ({
    page,
    addFileButton,
    fileSystemExplorer: _fileSystemExplorer,
    testTmp,
    waitForFilesToBeProcessed,
    storage,
    filePicker,
    assertFileExplorerItems,
  }) => {
    // Upload test files to storage
    await storage.uploadFile(testTmp.join('test.csv'), 'test.csv');
    await storage.uploadFile(testTmp.join('data.json'), 'data.json');

    // Set up file picker to select these files
    // Note: Only selecting supported data source files (not .txt)
    await filePicker.selectFiles(['test.csv', 'data.json']);

    // Click add file button
    await addFileButton.click();

    // Wait for files to appear in the explorer
    await page.waitForSelector(
      '[data-testid="data-explorer-fs"] [data-testid*="tree-node-"][data-testid$="-container"]',
      { state: 'visible', timeout: 10000 },
    );

    await waitForFilesToBeProcessed();

    // Check that all data source files are visible initially (sorted alphabetically)
    // Note: .txt files are not considered data source files
    await assertFileExplorerItems(['data', 'test']);

    // Click files filter - should still show data source files
    await page.getByRole('button', { name: 'Files' }).click();
    await assertFileExplorerItems(['data', 'test']);

    // Click databases filter - should hide files
    await page.getByRole('button', { name: 'Local databases' }).click();
    // When filtered to databases only, file explorer should be empty or show 'No files'
    await assertFileExplorerItems([]);

    // Click all filter - should show everything again
    await page.getByRole('button', { name: 'Show all' }).click();
    await assertFileExplorerItems(['data', 'test']);
  });

  // eslint-disable-next-line playwright/expect-expect
  test('should filter by file type using dropdown', async ({
    page,
    addFileButton,
    fileSystemExplorer: _fileSystemExplorer,
    testTmp,
    waitForFilesToBeProcessed,
    waitForAnimationComplete,
    storage,
    filePicker,
    assertFileExplorerItems,
  }) => {
    // Upload test files to storage
    await storage.uploadFile(testTmp.join('test.csv'), 'test.csv');
    await storage.uploadFile(testTmp.join('data.json'), 'data.json');

    // Set up file picker to select these files
    await filePicker.selectFiles(['test.csv', 'data.json']);

    // Click add file button
    await addFileButton.click();

    // Wait for files to appear in the explorer
    await page.waitForSelector(
      '[data-testid="data-explorer-fs"] [data-testid*="tree-node-"][data-testid$="-container"]',
      { state: 'visible', timeout: 10000 },
    );

    await waitForFilesToBeProcessed();

    // First, click the Files filter button to ensure we're viewing files
    await page.getByRole('button', { name: 'Files' }).click();
    await waitForAnimationComplete();

    // The Files button should open the menu when already active
    await page.getByRole('button', { name: 'Files' }).click();
    await waitForAnimationComplete();

    // Initially all file types should be selected
    await assertFileExplorerItems(['data', 'test']);

    // Deselect all by clicking "All file types"
    await page.getByRole('menuitem', { name: 'All file types' }).click();
    await waitForAnimationComplete();

    // Should not show any data files now
    await assertFileExplorerItems([]);

    // Select only CSV
    await page.getByRole('menuitem', { name: 'CSV' }).click();
    await waitForAnimationComplete();

    // Should only show CSV files
    await assertFileExplorerItems(['test']);

    // Also select JSON
    await page.getByRole('menuitem', { name: 'JSON' }).click();
    await waitForAnimationComplete();

    // Should show CSV and JSON files
    await assertFileExplorerItems(['data', 'test']);

    // Select all again by clicking "All file types"
    await page.getByRole('menuitem', { name: 'All file types' }).click();
    await waitForAnimationComplete();

    // Should show all data files again
    await assertFileExplorerItems(['data', 'test']);

    // Close the menu by clicking outside
    await page.getByTestId('data-explorer-filters').click({ position: { x: 5, y: 5 } });
  });
});
