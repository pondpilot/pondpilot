import { expect, mergeTests } from '@playwright/test';

import { createFile } from '../../utils';
import { test as dataViewTest } from '../fixtures/data-view';
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
  dataViewTest,
);

test.describe('Unified Explorer', () => {
  test.beforeEach(async ({ testTmp }) => {
    // Create test files
    await createFile(testTmp.join('data.csv'), 'name,value\ntest1,1\ntest2,2');
    await createFile(testTmp.join('report.json'), '{"data": "test"}');
  });

  test('should display mixed content types with proper section headers', async ({
    page,
    addFile,
    testTmp,
    waitForFilesToBeProcessed,
    storage,
    filePicker,
    assertFileExplorerItems,
  }) => {
    // Upload test files to storage
    await storage.uploadFile(testTmp.join('data.csv'), 'data.csv');
    await storage.uploadFile(testTmp.join('report.json'), 'report.json');

    // Set up file picker to select these files
    await filePicker.selectFiles(['data.csv', 'report.json']);

    // Click add file button
    await addFile();

    // Wait for files to appear in the file system explorer
    await page
      .locator('[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });

    await waitForFilesToBeProcessed();

    // Check that the "Local" section header is visible using data-testid
    await expect(page.getByTestId('data-explorer-section-data-explorer-fs')).toBeVisible();

    // Check that both files are visible in the explorer using the working assertion helper
    await assertFileExplorerItems(['data', 'report']);
  });

  test('should show section headers only when content exists', async ({
    page,
    addFile,
    testTmp,
    waitForFilesToBeProcessed,
    storage,
    filePicker,
  }) => {
    // Upload only CSV file
    await storage.uploadFile(testTmp.join('data.csv'), 'data.csv');
    await filePicker.selectFiles(['data.csv']);
    await addFile();

    await page
      .locator('[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });

    await waitForFilesToBeProcessed();

    // Local section should be visible
    await expect(page.getByTestId('data-explorer-section-data-explorer-fs')).toBeVisible();

    // Local Databases section should not exist (no databases added)
    await expect(page.getByTestId('data-explorer-section-data-explorer-local')).not.toBeAttached();

    // Remote Databases section should not exist (no remote databases)
    await expect(page.getByTestId('data-explorer-section-data-explorer-remote')).not.toBeAttached();
  });

  test('should handle file operations correctly', async ({
    page,
    addFile,
    testTmp,
    waitForFilesToBeProcessed,
    storage,
    filePicker,
    openFileFromExplorer,
    assertDataTableMatches,
  }) => {
    // Upload test files
    await storage.uploadFile(testTmp.join('data.csv'), 'data.csv');
    await filePicker.selectFiles(['data.csv']);
    await addFile();

    await page
      .locator('[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });

    await waitForFilesToBeProcessed();

    // Open the file and verify its content
    await openFileFromExplorer('data');
    await assertDataTableMatches({
      data: [
        ['test1', '1'],
        ['test2', '2'],
      ],
      columnNames: ['name', 'value'],
    });
  });

  test('should support file selection interactions', async ({
    page,
    addFile,
    testTmp,
    waitForFilesToBeProcessed,
    storage,
    filePicker,
    assertFileExplorerItems,
    clickFileByName,
  }) => {
    // Create multiple files
    await createFile(testTmp.join('file1.csv'), 'col\nval1');
    await createFile(testTmp.join('file2.csv'), 'col\nval2');
    await createFile(testTmp.join('file3.csv'), 'col\nval3');

    // Upload test files
    await storage.uploadFile(testTmp.join('file1.csv'), 'file1.csv');
    await storage.uploadFile(testTmp.join('file2.csv'), 'file2.csv');
    await storage.uploadFile(testTmp.join('file3.csv'), 'file3.csv');

    await filePicker.selectFiles(['file1.csv', 'file2.csv', 'file3.csv']);
    await addFile();

    await page
      .locator('[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });

    await waitForFilesToBeProcessed();

    // Verify all files are present using the working assertion helper
    await assertFileExplorerItems(['file1', 'file2', 'file3']);

    // Test basic selection by clicking on a file using the working helper
    await clickFileByName('file1');

    // Verify the Local section header is still visible after interaction
    await expect(page.getByTestId('data-explorer-section-data-explorer-fs')).toBeVisible();
  });

  // eslint-disable-next-line playwright/expect-expect
  test('should handle file interactions via explorer', async ({
    page,
    addFile,
    testTmp,
    waitForFilesToBeProcessed,
    storage,
    filePicker,
    assertFileExplorerItems,
    clickFileMenuItemByName,
  }) => {
    // Upload test file
    await storage.uploadFile(testTmp.join('data.csv'), 'data.csv');
    await filePicker.selectFiles(['data.csv']);
    await addFile();

    await page
      .locator('[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });

    await waitForFilesToBeProcessed();

    // Verify file is present
    await assertFileExplorerItems(['data']);

    // Test that we can interact with the file via menu
    // This tests the context menu functionality indirectly
    await clickFileMenuItemByName('data', 'Delete');

    // Verify file is removed
    await assertFileExplorerItems([]);
  });

  test('should maintain proper file organization in sections', async ({
    page,
    addFile,
    testTmp,
    waitForFilesToBeProcessed,
    storage,
    filePicker,
    assertFileExplorerItems,
  }) => {
    // Create different file types
    await createFile(testTmp.join('spreadsheet.csv'), 'data');
    await createFile(testTmp.join('config.json'), '{}');

    // Upload files
    await storage.uploadFile(testTmp.join('spreadsheet.csv'), 'spreadsheet.csv');
    await storage.uploadFile(testTmp.join('config.json'), 'config.json');

    await filePicker.selectFiles(['spreadsheet.csv', 'config.json']);
    await addFile();

    await page
      .locator('[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });

    await waitForFilesToBeProcessed();

    // Verify files are organized under the correct section
    await expect(page.getByTestId('data-explorer-section-data-explorer-fs')).toBeVisible();

    // Use the working assertion helper to verify both files are present
    // Files may appear in alphabetical order
    await assertFileExplorerItems(['config', 'spreadsheet']);
  });

  test('should handle section headers and content visibility', async ({
    page,
    addFile,
    testTmp,
    waitForFilesToBeProcessed,
    storage,
    filePicker,
    assertFileExplorerItems,
  }) => {
    // Start with no files - should not show Local section (element should not exist)
    await expect(page.getByTestId('data-explorer-section-data-explorer-fs')).not.toBeAttached();

    // Add a file
    await storage.uploadFile(testTmp.join('data.csv'), 'data.csv');
    await filePicker.selectFiles(['data.csv']);
    await addFile();

    await page
      .locator('[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });

    await waitForFilesToBeProcessed();

    // Now Local section should be visible
    await expect(page.getByTestId('data-explorer-section-data-explorer-fs')).toBeVisible();
    await assertFileExplorerItems(['data']);

    // The section header should remain a text element (not collapsible button)
    // This tests that the current implementation shows section headers as static text
    const localFilesHeader = page.getByTestId('data-explorer-section-data-explorer-fs');
    await expect(localFilesHeader).toBeVisible();

    // Verify the header is a Text component, not a Button
    await expect(localFilesHeader).not.toHaveAttribute('role', 'button');
  });
});
