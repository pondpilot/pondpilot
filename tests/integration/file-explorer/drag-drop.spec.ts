import { expect, mergeTests, Page } from '@playwright/test';

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

const createDataTransferWithHandle = async (
  page: Page,
  options: { entryName: string; kind: 'file' | 'directory'; mimeType?: string },
) => {
  const dataTransferHandle = await page.evaluateHandle(async ({ entryName, kind, mimeType }) => {
    const dataTransfer = new DataTransfer();
    const rootDirHandle = await navigator.storage.getDirectory();

    const handle =
      kind === 'directory'
        ? await rootDirHandle.getDirectoryHandle(entryName)
        : await rootDirHandle.getFileHandle(entryName);

    const mockItem = {
      kind: 'file',
      type: mimeType ?? '',
      getAsFileSystemHandle: () => Promise.resolve(handle),
    };

    Object.defineProperty(dataTransfer, 'items', {
      value: [mockItem],
      configurable: true,
    });
    Object.defineProperty(dataTransfer, 'types', {
      value: ['Files'],
      configurable: true,
    });

    return dataTransfer;
  }, options);

  return dataTransferHandle;
};

test('Dnd overlay responds only to file drags', async ({ page }) => {
  // Wait for the DnD overlay to be ready
  const dndOverlay = page.getByTestId('dnd-overlay');
  await expect(dndOverlay).toBeAttached();
  const overlayText = page.getByText('Drop your files here!');

  await expect(overlayText).toBeHidden();

  // Simulate dragging non-file content; overlay should stay hidden
  const emptyTransfer = await page.evaluateHandle(() => new DataTransfer());
  await page.dispatchEvent('[data-testid="dnd-overlay"]', 'dragover', {
    dataTransfer: emptyTransfer,
  });
  await expect(overlayText).toBeHidden();
  await emptyTransfer.dispose();

  // Simulate dragging files; overlay should become visible
  const fileTransfer = await page.evaluateHandle(() => {
    const dataTransfer = new DataTransfer();
    Object.defineProperty(dataTransfer, 'types', {
      value: ['Files'],
      configurable: true,
    });
    return dataTransfer;
  });
  await page.dispatchEvent('[data-testid="dnd-overlay"]', 'dragover', {
    dataTransfer: fileTransfer,
  });
  await expect(overlayText).toBeVisible();

  // Simulate dragleave with file drag; overlay should hide again
  await page.dispatchEvent('[data-testid="dnd-overlay"]', 'dragleave', {
    dataTransfer: fileTransfer,
  });
  await expect(overlayText).toBeHidden();
  await fileTransfer.dispose();
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
  const csvTransfer = await createDataTransferWithHandle(page, {
    entryName: 'test-data.csv',
    kind: 'file',
    mimeType: 'text/csv',
  });
  await page.dispatchEvent('[data-testid="dnd-overlay"]', 'drop', {
    dataTransfer: csvTransfer,
  });
  await csvTransfer.dispose();

  // Wait for the file to be processed and appear in the explorer
  await page.waitForSelector(
    '[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]',
    {
      timeout: 5000,
    },
  );

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
  const folderTransfer = await createDataTransferWithHandle(page, {
    entryName: folderName,
    kind: 'directory',
  });
  await page.dispatchEvent('[data-testid="dnd-overlay"]', 'drop', {
    dataTransfer: folderTransfer,
  });
  await folderTransfer.dispose();

  // Wait for the folder to be processed and appear in the explorer
  await page.waitForSelector(
    '[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]',
    {
      timeout: 5000,
    },
  );

  // Wait for folder and files to appear in file explorer
  await assertFileExplorerItems(['test-folder']);

  // Expand folder to see files inside
  await clickFileByName('test-folder');

  // Check that files inside the folder are visible

  await assertFileExplorerItems(['test-folder', 'products', 'users']);
});
