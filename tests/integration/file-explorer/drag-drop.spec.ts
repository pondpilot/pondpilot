import { expect, mergeTests } from '@playwright/test';

import { test as filePickerTest } from '../fixtures/file-picker';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as globalHotkeyTest } from '../fixtures/global-hotkeys';
import { test as baseTest } from '../fixtures/page';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as storageTest } from '../fixtures/storage';
import { test as testTmpTest } from '../fixtures/test-tmp';

const test = mergeTests(
  baseTest,
  scriptExplorerTest,
  storageTest,
  filePickerTest,
  testTmpTest,
  fileSystemExplorerTest,
  globalHotkeyTest,
);

test('Dnd overlay shows and hides', async ({ page }) => {
  // Wait for the DnD overlay to be ready
  const dndOverlay = page.getByTestId('dnd-overlay');
  await expect(dndOverlay).toBeAttached();

  // Simulate dragenter event to trigger the overlay
  await page.dispatchEvent('[data-testid="dnd-overlay"]', 'dragover');

  // Check if drag overlay becomes visible (should show "Drop your files here!")
  await expect(page.getByText('Drop your files here!')).toBeVisible();

  // Simulate dragleave to hide the overlay
  await page.dispatchEvent('[data-testid="dnd-overlay"]', 'dragleave');

  // Verify overlay is hidden
  await expect(page.getByText('Drop your files here!')).toBeHidden();
});

test('Drop CSV file via drag and drop', async ({
  testTmp,
  page,
  storage,
  assertFileExplorerItems,
}) => {
  // Create a test CSV file
  const csvContent = 'name,age\nJohn,25\nJane,30';
  const csvPath = testTmp.join('test-data.csv');

  // Write file to local filesystem and upload to OPFS storage
  const { writeFileSync } = await import('fs');
  writeFileSync(csvPath, csvContent);
  await storage.uploadFile(csvPath, 'test-data.csv');

  // Wait for the DnD overlay to be ready
  const dndOverlay = page.getByTestId('dnd-overlay');
  await expect(dndOverlay).toBeAttached();

  // Simulate drag and drop by creating a real FileSystemFileHandle from OPFS
  await page.dispatchEvent('[data-testid="dnd-overlay"]', 'drop', {
    dataTransfer: await page.evaluateHandle(async () => {
      const dt = new DataTransfer();

      // Get the actual FileSystemFileHandle from OPFS (similar to file-picker.ts)
      const dirHandle = await navigator.storage.getDirectory();
      const fileHandle = await dirHandle.getFileHandle('test-data.csv');

      // Create a DataTransferItem that mimics browser drag & drop behavior
      const mockItem = {
        kind: 'file',
        type: 'text/csv',
        getAsFileSystemHandle: () => Promise.resolve(fileHandle),
      };

      // Add the mock item to dataTransfer
      Object.defineProperty(dt, 'items', {
        value: [mockItem],
      });

      return dt;
    }),
  });

  await assertFileExplorerItems(['test-data']);
});

test('Drop folder with files via drag and drop', async ({
  testTmp,
  page,
  storage,
  assertFileExplorerItems,
  clickFileByName,
}) => {
  // Create a test folder with files inside
  const folderName = 'test-folder';
  const csvContent = 'id,product,price\n1,Widget,19.99\n2,Gadget,29.99';
  const jsonContent = JSON.stringify({ users: [{ name: 'Alice' }, { name: 'Bob' }] });

  // Create files locally
  const csvPath = testTmp.join(`${folderName}/products.csv`);
  const jsonPath = testTmp.join(`${folderName}/users.json`);

  const { writeFileSync, mkdirSync } = await import('fs');
  mkdirSync(testTmp.join(folderName), { recursive: true });
  writeFileSync(csvPath, csvContent);
  writeFileSync(jsonPath, jsonContent);

  // Upload folder and files to OPFS storage
  await storage.createDir(folderName);
  await storage.uploadFile(csvPath, `${folderName}/products.csv`);
  await storage.uploadFile(jsonPath, `${folderName}/users.json`);

  // Wait for the DnD overlay to be ready
  const dndOverlay = page.getByTestId('dnd-overlay');
  await expect(dndOverlay).toBeAttached();

  // Simulate drag and drop of folder
  await page.dispatchEvent('[data-testid="dnd-overlay"]', 'drop', {
    dataTransfer: await page.evaluateHandle(async (folder) => {
      const dt = new DataTransfer();

      // Get the actual FileSystemDirectoryHandle from OPFS
      const rootDirHandle = await navigator.storage.getDirectory();
      const folderHandle = await rootDirHandle.getDirectoryHandle(folder);

      // Create a DataTransferItem that mimics browser drag & drop behavior for directory
      const mockItem = {
        kind: 'file',
        type: '',
        getAsFileSystemHandle: () => Promise.resolve(folderHandle),
      };

      // Add the mock item to dataTransfer
      Object.defineProperty(dt, 'items', {
        value: [mockItem],
      });

      return dt;
    }, folderName),
  });

  // Wait for folder and files to appear in file explorer
  await assertFileExplorerItems(['test-folder']);

  // Expand folder to see files inside
  await clickFileByName('test-folder');

  // Check that files inside the folder are visible

  await assertFileExplorerItems(['test-folder', 'products', 'users']);
});
