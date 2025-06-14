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

test.describe('Unified Explorer', () => {
  test.beforeEach(async ({ testTmp }) => {
    // Create test files
    await createFile(testTmp.join('data.csv'), 'name,value\ntest1,1\ntest2,2');
    await createFile(testTmp.join('test.db'), 'dummy database');
    await createFile(testTmp.join('report.json'), '{"data": "test"}');
  });

  test.skip('should display mixed content types in unified view', async ({
    page,
    addFileButton,
    testTmp,
    waitForFilesToBeProcessed,
    waitForExplorerReady,
    storage,
    filePicker,
  }) => {
    // Upload test files to storage
    await storage.uploadFile(testTmp.join('data.csv'), 'data.csv');
    await storage.uploadFile(testTmp.join('report.json'), 'report.json');

    // Set up file picker to select these files
    // Note: Skipping .db file as it needs to be a valid DuckDB file
    await filePicker.selectFiles(['data.csv', 'report.json']);

    // Click add file button
    await addFileButton.click();

    // Wait for files to appear in the file system explorer
    await page.waitForSelector(
      '[data-testid="data-explorer-fs"] [data-testid*="tree-node-"][data-testid$="-container"]',
      { state: 'visible', timeout: 10000 },
    );

    await waitForFilesToBeProcessed();

    // Check that unified explorer shows both files and databases sections
    const explorer = page.getByTestId('data-explorer');
    await expect(explorer).toBeVisible();

    // Should show files section
    await expect(explorer.getByText('Local Files')).toBeVisible();
    await expect(explorer).toContainText('data');
    await expect(explorer).toContainText('report');
  });

  test.skip('should handle section expand/collapse', async ({
    page,
    addFileButton,
    testTmp,
    waitForFilesToBeProcessed,
    waitForAnimationComplete,
    storage,
    filePicker,
  }) => {
    // Upload test files to storage
    await storage.uploadFile(testTmp.join('file1.csv'), 'file1.csv');
    await storage.uploadFile(testTmp.join('file2.json'), 'file2.json');

    // Set up file picker to select these files
    await filePicker.selectFiles(['file1.csv', 'file2.json']);

    // Click add file button
    await addFileButton.click();

    // Wait for files to appear in the file system explorer
    await page.waitForSelector(
      '[data-testid="data-explorer-fs"] [data-testid*="tree-node-"][data-testid$="-container"]',
      { state: 'visible', timeout: 10000 },
    );

    await waitForFilesToBeProcessed();

    const explorer = page.getByTestId('data-explorer');

    // Find the Local Files section header - it should be a button for expand/collapse
    const filesSection = explorer.getByRole('button', { name: 'Local Files' }).first();

    // Files should be visible initially
    await expect(explorer).toContainText('file1');
    await expect(explorer).toContainText('file2');

    // Collapse Local Files section
    await filesSection.click();
    await waitForAnimationComplete();

    // Files should be hidden
    await expect(explorer.getByText('file1')).toBeHidden();
    await expect(explorer.getByText('file2')).toBeHidden();

    // Expand Local Files section again
    await filesSection.click();
    await waitForAnimationComplete();

    // Files should be visible again
    await expect(explorer).toContainText('file1');
    await expect(explorer).toContainText('file2');
  });

  test.skip('should support multi-select across different types', async ({
    page,
    addFileButton,
    testTmp,
    waitForFilesToBeProcessed,
    storage,
    filePicker,
  }) => {
    const testFiles = ['data1.csv', 'data2.csv', 'info.json'];

    // Create files and upload to storage
    for (const file of testFiles) {
      await createFile(testTmp.join(file), 'test content');
      await storage.uploadFile(testTmp.join(file), file);
    }

    // Set up file picker to select these files
    await filePicker.selectFiles(testFiles);

    // Click add file button
    await addFileButton.click();

    // Wait for files to appear in the file system explorer
    await page.waitForSelector(
      '[data-testid="data-explorer-fs"] [data-testid*="tree-node-"][data-testid$="-container"]',
      { state: 'visible', timeout: 10000 },
    );

    await waitForFilesToBeProcessed();

    const explorer = page.getByTestId('data-explorer');

    // Select first file
    const firstFile = explorer.getByRole('treeitem', { name: /data1/i });
    await firstFile.click();
    await expect(firstFile).toHaveAttribute('data-selected', 'true');

    // Ctrl/Cmd click to multi-select another file
    const secondFile = explorer.getByRole('treeitem', { name: /info/i });
    await secondFile.click({ modifiers: ['Control'] });

    // Both should be selected
    await expect(firstFile).toHaveAttribute('data-selected', 'true');
    await expect(secondFile).toHaveAttribute('data-selected', 'true');

    // Shift click to select range
    const thirdFile = explorer.getByRole('treeitem', { name: /data2/i });
    await thirdFile.click({ modifiers: ['Shift'] });

    // Check that multiple items are selected
    const selectedItems = explorer.locator('[data-selected="true"]');
    const count = await selectedItems.count();
    expect(count).toBeGreaterThan(2);
  });

  test.skip('should show appropriate context menu for different node types', async ({
    page,
    addFileButton,
    testTmp,
    waitForFilesToBeProcessed,
    waitForAnimationComplete,
    storage,
    filePicker,
  }) => {
    // Upload test files to storage
    await storage.uploadFile(testTmp.join('data.csv'), 'data.csv');
    await storage.uploadFile(testTmp.join('data.json'), 'data.json');

    // Set up file picker to select these files
    await filePicker.selectFiles(['data.csv', 'data.json']);

    // Click add file button
    await addFileButton.click();

    // Wait for files to appear in the file system explorer
    await page.waitForSelector(
      '[data-testid="data-explorer-fs"] [data-testid*="tree-node-"][data-testid$="-container"]',
      { state: 'visible', timeout: 10000 },
    );

    await waitForFilesToBeProcessed();

    const explorer = page.getByTestId('data-explorer');

    // Right-click on CSV file
    const csvFile = explorer.getByRole('treeitem', { name: /data/i }).first();
    await csvFile.click({ button: 'right' });

    // Check CSV file context menu items
    await expect(page.getByRole('menuitem', { name: /open/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /rename/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /remove/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /copy path/i })).toBeVisible();

    // Click away to close menu
    await page.keyboard.press('Escape');
    await waitForAnimationComplete();

    // Right-click on JSON file
    const jsonFile = explorer.getByRole('treeitem', { name: /data/i }).last();
    await jsonFile.click({ button: 'right' });

    // JSON files should have similar context menu options
    await expect(page.getByRole('menuitem', { name: /open/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /rename/i })).toBeVisible();

    // Close menu
    await page.keyboard.press('Escape');
  });

  test.skip('should handle bulk operations on selected items', async ({
    page,
    addFileButton,
    testTmp,
    waitForFilesToBeProcessed,
    waitForAnimationComplete,
    storage,
    filePicker,
  }) => {
    const testFiles = ['remove1.csv', 'remove2.csv', 'keep.json'];

    // Create files and upload to storage
    for (const file of testFiles) {
      await createFile(testTmp.join(file), 'test content');
      await storage.uploadFile(testTmp.join(file), file);
    }

    // Set up file picker to select these files
    await filePicker.selectFiles(testFiles);

    // Click add file button
    await addFileButton.click();

    // Wait for files to appear in the file system explorer
    await page.waitForSelector(
      '[data-testid="data-explorer-fs"] [data-testid*="tree-node-"][data-testid$="-container"]',
      { state: 'visible', timeout: 10000 },
    );

    await waitForFilesToBeProcessed();

    const explorer = page.getByTestId('data-explorer');

    // Select multiple files to remove
    const file1 = explorer.getByRole('treeitem', { name: /remove1/i });
    const file2 = explorer.getByRole('treeitem', { name: /remove2/i });

    await file1.click();
    await file2.click({ modifiers: ['Control'] });

    // Right-click on one of the selected items
    await file2.click({ button: 'right' });

    // Should show bulk operations
    await expect(page.getByRole('menuitem', { name: /remove.*2.*items/i })).toBeVisible();

    // Click remove
    await page.getByRole('menuitem', { name: /remove/i }).click();

    // Confirm removal if dialog appears
    const confirmButton = page.getByRole('button', { name: /confirm|remove/i });
    if (await confirmButton.isVisible({ timeout: 1000 })) {
      await confirmButton.click();
    }

    // Wait for the removal to complete
    await waitForAnimationComplete();

    // Check that files are removed
    await expect(explorer).not.toContainText('remove1');
    await expect(explorer).not.toContainText('remove2');
    await expect(explorer).toContainText('keep');
  });

  test.skip('should maintain selection state when filtering', async ({
    page,
    addFileButton,
    testTmp,
    waitForFilesToBeProcessed,
    waitForSearchDebounce,
    storage,
    filePicker,
  }) => {
    const testFiles = ['selected.csv', 'also_selected.json', 'not_selected.txt'];

    // Create files and upload to storage
    for (const file of testFiles) {
      await createFile(testTmp.join(file), 'test content');
      await storage.uploadFile(testTmp.join(file), file);
    }

    // Set up file picker to select these files
    await filePicker.selectFiles(testFiles);

    // Click add file button
    await addFileButton.click();

    // Wait for files to appear in the file system explorer
    await page.waitForSelector(
      '[data-testid="data-explorer-fs"] [data-testid*="tree-node-"][data-testid$="-container"]',
      { state: 'visible', timeout: 10000 },
    );

    await waitForFilesToBeProcessed();

    const explorer = page.getByTestId('data-explorer');

    // Select some files
    const file1 = explorer.getByRole('treeitem', { name: /selected/i }).first();
    const file2 = explorer.getByRole('treeitem', { name: /also_selected/i });

    await file1.click();
    await file2.click({ modifiers: ['Control'] });

    // Verify selection
    await expect(file1).toHaveAttribute('data-selected', 'true');
    await expect(file2).toHaveAttribute('data-selected', 'true');

    // Apply search filter
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('selected');
    await waitForSearchDebounce();

    // Selected items that match filter should remain selected
    await expect(file1).toHaveAttribute('data-selected', 'true');
    await expect(file2).toHaveAttribute('data-selected', 'true');

    // Clear filter
    await searchInput.clear();
    await waitForSearchDebounce();

    // Selection should be maintained
    await expect(file1).toHaveAttribute('data-selected', 'true');
    await expect(file2).toHaveAttribute('data-selected', 'true');
  });
});
