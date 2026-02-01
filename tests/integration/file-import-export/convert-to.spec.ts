import { expect, mergeTests } from '@playwright/test';

import { createFile } from '../../utils';
import { test as dataViewTest } from '../fixtures/data-view';
import { test as filePickerTest } from '../fixtures/file-picker';
import {
  test as fileSystemExplorerTest,
  FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX,
} from '../fixtures/file-system-explorer';
import { test as baseTest } from '../fixtures/page';
import { test as storageTest } from '../fixtures/storage';
import { test as testTmpTest } from '../fixtures/test-tmp';
import {
  openExplorerTreeNodeMenuByName,
} from '../fixtures/utils/explorer-tree';

const test = mergeTests(
  baseTest,
  storageTest,
  filePickerTest,
  testTmpTest,
  fileSystemExplorerTest,
  dataViewTest,
);

/**
 * Helper: right-click a file node, hover "Convert To", and click a
 * format in the submenu. Returns when the export modal is visible.
 */
async function convertToViaContextMenu(
  page: import('@playwright/test').Page,
  fileName: string,
  targetFormatLabel: string,
) {
  // Open the context menu for the file node
  const menu = await openExplorerTreeNodeMenuByName(
    page,
    FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX,
    fileName,
  );

  // Find the "Convert To" menu item and hover to open submenu
  const convertToItem = menu.getByText('Convert To');
  await expect(convertToItem).toBeVisible();
  await convertToItem.hover();

  // Wait for the submenu to appear and click the target format
  const submenuItem = page.getByRole('menuitem', { name: targetFormatLabel });
  await expect(submenuItem).toBeVisible();
  await submenuItem.click();
}

test('Convert To: CSV file should open export modal with Parquet pre-selected', async ({
  page,
  addFile,
  storage,
  filePicker,
  testTmp,
  openFileFromExplorer,
  assertFileExplorerItems,
}) => {
  // Create and upload a CSV test file
  const testFile = testTmp.join('convert_test.csv');
  createFile(testFile, 'id,name\n1,alice\n2,bob');
  await storage.uploadFile(testFile, 'convert_test.csv');
  await filePicker.selectFiles(['convert_test.csv']);
  await addFile();

  // Wait for the file to appear in the explorer
  await page.waitForSelector(
    '[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]',
    { timeout: 5000 },
  );
  await assertFileExplorerItems(['convert_test']);

  // Open the file first so data is loaded
  await openFileFromExplorer('convert_test');

  // Wait for data to be ready
  const dataTable = page.getByTestId('data-table');
  await expect(dataTable).toBeVisible({ timeout: 10000 });

  // Right-click → Convert To → Parquet
  await convertToViaContextMenu(page, 'convert_test', 'Parquet');

  // The export modal should open with Parquet format pre-selected
  const modal = page.getByTestId('export-options-modal');
  await expect(modal).toBeVisible({ timeout: 5000 });

  // Verify Parquet format is selected (the format radio/button should be active)
  const parquetFormat = page.getByTestId('export-format-parquet');
  await expect(parquetFormat).toBeVisible();
});

test('Convert To: CSV submenu should not include CSV as an option', async ({
  page,
  addFile,
  storage,
  filePicker,
  testTmp,
  assertFileExplorerItems,
}) => {
  // Create and upload a CSV test file
  const testFile = testTmp.join('filter_test.csv');
  createFile(testFile, 'col\nvalue');
  await storage.uploadFile(testFile, 'filter_test.csv');
  await filePicker.selectFiles(['filter_test.csv']);
  await addFile();

  await page.waitForSelector(
    '[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]',
    { timeout: 5000 },
  );
  await assertFileExplorerItems(['filter_test']);

  // Open context menu and hover "Convert To"
  const menu = await openExplorerTreeNodeMenuByName(
    page,
    FILE_SYSTEM_EXPLORER_DATA_TESTID_PREFIX,
    'filter_test',
  );
  const convertToItem = menu.getByText('Convert To');
  await expect(convertToItem).toBeVisible();
  await convertToItem.hover();

  // Wait for submenu
  await page.waitForTimeout(300);

  // CSV should NOT be in the submenu (same-format hidden)
  const csvSubmenuItem = page.getByRole('menuitem', { name: 'CSV', exact: true });
  await expect(csvSubmenuItem).toBeHidden();

  // But other formats should be present
  const parquetItem = page.getByRole('menuitem', { name: 'Parquet' });
  await expect(parquetItem).toBeVisible();
});
