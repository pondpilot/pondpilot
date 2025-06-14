import { expect, mergeTests } from '@playwright/test';

import { createFile } from '../../utils';
import { test as dbExplorerTest } from '../fixtures/db-explorer';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as baseTest } from '../fixtures/page';
import { test as testTmpTest } from '../fixtures/test-tmp';

const test = mergeTests(baseTest, fileSystemExplorerTest, dbExplorerTest, testTmpTest);

test.describe('Unified Explorer', () => {
  test.beforeEach(async ({ testTmp }) => {
    // Create test files
    await createFile(testTmp.join('data.csv'), 'name,value\ntest1,1\ntest2,2');
    await createFile(testTmp.join('test.db'), 'dummy database');
    await createFile(testTmp.join('report.json'), '{"data": "test"}');
  });

  test('should display mixed content types in unified view', async ({
    page,
    addFileButton,
    testTmp,
  }) => {
    // Add test files
    await addFileButton.click();
    const fileInput = page.locator('input[type="file"]');
    const filePaths = ['data.csv', 'test.db', 'report.json'].map((file) => testTmp.join(file));

    await fileInput.setInputFiles(filePaths);
    await page.waitForTimeout(500);

    // Check that unified explorer shows both files and databases sections
    const explorer = page.getByTestId('data-explorer');
    await expect(explorer).toBeVisible();

    // Should show files section
    await expect(explorer.getByText('Files', { exact: true })).toBeVisible();
    await expect(explorer).toContainText('data.csv');
    await expect(explorer).toContainText('report.json');

    // Database files should appear in appropriate section
    await expect(explorer).toContainText('test.db');
  });

  test('should handle section expand/collapse', async ({ page, addFileButton, testTmp }) => {
    // Add test files
    await addFileButton.click();
    const fileInput = page.locator('input[type="file"]');
    const filePaths = ['file1.csv', 'file2.json'].map((file) => testTmp.join(file));

    await fileInput.setInputFiles(filePaths);
    await page.waitForTimeout(500);

    const explorer = page.getByTestId('data-explorer');

    // Find the Files section header
    const filesSection = explorer.getByRole('button', { name: /Files/i }).first();

    // Files should be visible initially
    await expect(explorer).toContainText('file1.csv');
    await expect(explorer).toContainText('file2.json');

    // Collapse Files section
    await filesSection.click();
    await page.waitForTimeout(200);

    // Files should be hidden
    await expect(explorer.getByText('file1.csv')).toBeHidden();
    await expect(explorer.getByText('file2.json')).toBeHidden();

    // Expand Files section again
    await filesSection.click();
    await page.waitForTimeout(200);

    // Files should be visible again
    await expect(explorer).toContainText('file1.csv');
    await expect(explorer).toContainText('file2.json');
  });

  test('should support multi-select across different types', async ({
    page,
    addFileButton,
    testTmp,
  }) => {
    // Add multiple files
    await addFileButton.click();
    const fileInput = page.locator('input[type="file"]');
    const testFiles = ['data1.csv', 'data2.csv', 'info.json', 'test.db'];

    for (const file of testFiles) {
      await createFile(testTmp.join(file), 'test content');
    }

    const filePaths = testFiles.map((file) => testTmp.join(file));
    await fileInput.setInputFiles(filePaths);
    await page.waitForTimeout(500);

    const explorer = page.getByTestId('data-explorer');

    // Select first file
    const firstFile = explorer.getByRole('treeitem', { name: /data1\.csv/i });
    await firstFile.click();
    await expect(firstFile).toHaveAttribute('aria-selected', 'true');

    // Ctrl/Cmd click to multi-select another file
    const secondFile = explorer.getByRole('treeitem', { name: /info\.json/i });
    await secondFile.click({ modifiers: ['Control'] });

    // Both should be selected
    await expect(firstFile).toHaveAttribute('aria-selected', 'true');
    await expect(secondFile).toHaveAttribute('aria-selected', 'true');

    // Shift click to select range
    const thirdFile = explorer.getByRole('treeitem', { name: /data2\.csv/i });
    await thirdFile.click({ modifiers: ['Shift'] });

    // Check that multiple items are selected
    const selectedItems = explorer.locator('[aria-selected="true"]');
    const count = await selectedItems.count();
    expect(count).toBeGreaterThan(2);
  });

  test('should show appropriate context menu for different node types', async ({
    page,
    addFileButton,
    testTmp,
  }) => {
    // Add files
    await addFileButton.click();
    const fileInput = page.locator('input[type="file"]');
    const filePaths = ['data.csv', 'test.db'].map((file) => testTmp.join(file));

    await fileInput.setInputFiles(filePaths);
    await page.waitForTimeout(500);

    const explorer = page.getByTestId('data-explorer');

    // Right-click on CSV file
    const csvFile = explorer.getByRole('treeitem', { name: /data\.csv/i });
    await csvFile.click({ button: 'right' });

    // Check CSV file context menu items
    await expect(page.getByRole('menuitem', { name: /open/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /rename/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /remove/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /copy path/i })).toBeVisible();

    // Click away to close menu
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Right-click on database file
    const dbFile = explorer.getByRole('treeitem', { name: /test\.db/i });
    await dbFile.click({ button: 'right' });

    // Database files might have different context menu options
    await expect(page.getByRole('menuitem', { name: /open/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /rename/i })).toBeVisible();

    // Close menu
    await page.keyboard.press('Escape');
  });

  test('should handle bulk operations on selected items', async ({
    page,
    addFileButton,
    testTmp,
  }) => {
    // Add multiple files
    await addFileButton.click();
    const fileInput = page.locator('input[type="file"]');
    const testFiles = ['remove1.csv', 'remove2.csv', 'keep.json'];

    for (const file of testFiles) {
      await createFile(testTmp.join(file), 'test content');
    }

    const filePaths = testFiles.map((file) => testTmp.join(file));
    await fileInput.setInputFiles(filePaths);
    await page.waitForTimeout(500);

    const explorer = page.getByTestId('data-explorer');

    // Select multiple files to remove
    const file1 = explorer.getByRole('treeitem', { name: /remove1\.csv/i });
    const file2 = explorer.getByRole('treeitem', { name: /remove2\.csv/i });

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

    // Check that files are removed
    await expect(explorer).not.toContainText('remove1.csv');
    await expect(explorer).not.toContainText('remove2.csv');
    await expect(explorer).toContainText('keep.json');
  });

  test('should maintain selection state when filtering', async ({
    page,
    addFileButton,
    testTmp,
  }) => {
    // Add files
    await addFileButton.click();
    const fileInput = page.locator('input[type="file"]');
    const testFiles = ['selected.csv', 'also_selected.json', 'not_selected.txt'];

    for (const file of testFiles) {
      await createFile(testTmp.join(file), 'test content');
    }

    const filePaths = testFiles.map((file) => testTmp.join(file));
    await fileInput.setInputFiles(filePaths);
    await page.waitForTimeout(500);

    const explorer = page.getByTestId('data-explorer');

    // Select some files
    const file1 = explorer.getByRole('treeitem', { name: /selected\.csv/i });
    const file2 = explorer.getByRole('treeitem', { name: /also_selected\.json/i });

    await file1.click();
    await file2.click({ modifiers: ['Control'] });

    // Verify selection
    await expect(file1).toHaveAttribute('aria-selected', 'true');
    await expect(file2).toHaveAttribute('aria-selected', 'true');

    // Apply search filter
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('selected');
    await page.waitForTimeout(300);

    // Selected items that match filter should remain selected
    await expect(file1).toHaveAttribute('aria-selected', 'true');
    await expect(file2).toHaveAttribute('aria-selected', 'true');

    // Clear filter
    await searchInput.clear();
    await page.waitForTimeout(300);

    // Selection should be maintained
    await expect(file1).toHaveAttribute('aria-selected', 'true');
    await expect(file2).toHaveAttribute('aria-selected', 'true');
  });
});
