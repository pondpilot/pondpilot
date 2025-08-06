import { expect, mergeTests } from '@playwright/test';

import { createFile } from '../../utils';
import { test as dataViewTest } from '../fixtures/data-view';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as baseTest } from '../fixtures/page';
import { test as storageTest } from '../fixtures/storage';
import { test as testTmpTest } from '../fixtures/test-tmp';
import { test as waitUtilsTest } from '../fixtures/wait-utils';

const test = mergeTests(
  baseTest,
  fileSystemExplorerTest,
  testTmpTest,
  waitUtilsTest,
  storageTest,
  filePickerTest,
  dataViewTest,
);

test.describe('File Columns Display', () => {
  test.beforeEach(async ({ testTmp }) => {
    // Create test CSV file with known columns
    await createFile(
      testTmp.join('users.csv'),
      'id,name,email\n1,John Doe,john@example.com\n2,Jane Smith,jane@example.com',
    );
  });

  test('should show Toggle columns option for files and display columns', async ({
    page,
    addFile,
    testTmp,
    waitForFilesToBeProcessed,
    storage,
    filePicker,
    assertFileExplorerItems,
  }) => {
    // Upload test file to storage
    await storage.uploadFile(testTmp.join('users.csv'), 'users.csv');
    await filePicker.selectFiles(['users.csv']);
    await addFile();

    // Wait for file to appear in the explorer
    await page
      .locator('[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });

    await waitForFilesToBeProcessed();

    // Verify file is present
    await assertFileExplorerItems(['users']);

    // Right-click on file to open context menu
    const fileNode = page
      .locator('[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]')
      .filter({
        has: page.locator('p').getByText('users', { exact: true }),
      });

    await fileNode.click({ button: 'right' });

    // Check if "Toggle columns" option appears in context menu
    const toggleColumnsItem = page.getByRole('menuitem', { name: 'Toggle columns' });
    await expect(toggleColumnsItem).toBeVisible();

    // Click "Toggle columns" to expand columns
    await toggleColumnsItem.click();

    // Wait for columns to appear and verify they're visible in the tree
    await expect(page.locator('[data-testid*="::id-container"]')).toBeVisible();
    await expect(page.locator('[data-testid*="::name-container"]')).toBeVisible();
    await expect(page.locator('[data-testid*="::email-container"]')).toBeVisible();
  });

  test('should expand file columns with Alt+Click and collapse on second Alt+Click', async ({
    page,
    addFile,
    testTmp,
    waitForFilesToBeProcessed,
    storage,
    filePicker,
    assertFileExplorerItems,
  }) => {
    // Upload test file to storage
    await storage.uploadFile(testTmp.join('users.csv'), 'users.csv');
    await filePicker.selectFiles(['users.csv']);
    await addFile();

    // Wait for file to appear in the explorer
    await page
      .locator('[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });

    await waitForFilesToBeProcessed();

    // Verify file is present
    await assertFileExplorerItems(['users']);

    // Get file node
    const fileNode = page
      .locator('[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]')
      .filter({
        has: page.locator('p').getByText('users', { exact: true }),
      });

    // Initially columns should not be visible
    await expect(page.getByText('id')).toBeHidden();
    await expect(page.getByText('name')).toBeHidden();
    await expect(page.getByText('email')).toBeHidden();

    // Alt+Click to expand columns
    await fileNode.click({ modifiers: ['Alt'] });

    // Wait for columns to appear
    await expect(page.locator('[data-testid*="::id-container"]')).toBeVisible();
    await expect(page.locator('[data-testid*="::name-container"]')).toBeVisible();
    await expect(page.locator('[data-testid*="::email-container"]')).toBeVisible();

    // Alt+Click again to collapse columns
    await fileNode.click({ modifiers: ['Alt'] });

    // Verify that columns are now hidden in the tree
    await expect(page.locator('[data-testid*="::id-container"]')).toBeHidden();
    await expect(page.locator('[data-testid*="::name-container"]')).toBeHidden();
    await expect(page.locator('[data-testid*="::email-container"]')).toBeHidden();
  });

  test('should NOT expand file columns with regular click', async ({
    page,
    addFile,
    testTmp,
    waitForFilesToBeProcessed,
    storage,
    filePicker,
    assertFileExplorerItems,
  }) => {
    // Upload test file to storage
    await storage.uploadFile(testTmp.join('users.csv'), 'users.csv');
    await filePicker.selectFiles(['users.csv']);
    await addFile();

    // Wait for file to appear in the explorer
    await page
      .locator('[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });

    await waitForFilesToBeProcessed();

    // Verify file is present
    await assertFileExplorerItems(['users']);

    // Get file node
    const fileNode = page
      .locator('[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]')
      .filter({
        has: page.locator('p').getByText('users', { exact: true }),
      });

    // Initially columns should not be visible
    await expect(page.locator('[data-testid*="::id-container"]')).toBeHidden();
    await expect(page.locator('[data-testid*="::name-container"]')).toBeHidden();
    await expect(page.locator('[data-testid*="::email-container"]')).toBeHidden();

    // Regular click should NOT expand columns
    await fileNode.click();

    // Verify that columns are still NOT visible (regular click doesn't expand)
    await expect(page.locator('[data-testid*="::id-container"]')).toBeHidden();
    await expect(page.locator('[data-testid*="::name-container"]')).toBeHidden();
    await expect(page.locator('[data-testid*="::email-container"]')).toBeHidden();
  });
});
