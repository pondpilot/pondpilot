import * as fs from 'fs';

import { mergeTests, expect } from '@playwright/test';

import { test as dataViewTest } from '../fixtures/data-view';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as baseTest } from '../fixtures/page';

const test = mergeTests(baseTest, filePickerTest, dataViewTest);

test('should show user-friendly error for CSV files exceeding max line size', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  assertFileExplorerItems,
  page,
}) => {
  // Create a CSV file with a line exceeding 10MB (current limit)
  const csvPath = testTmp.join('oversized_line.csv');

  // Create header
  const header = 'id,data\n';

  // Create a row with a 15MB data field (exceeding the 10MB limit)
  const largeDataSize = 15 * 1024 * 1024; // 15MB
  const largeData = 'Y'.repeat(largeDataSize);
  const row1 = `1,'${largeData}'\n`;

  // Write the CSV file
  fs.writeFileSync(csvPath, header + row1);

  // Upload the file
  await storage.uploadFile(csvPath, 'oversized_line.csv');

  // Patch the file picker
  await filePicker.selectFiles(['oversized_line.csv']);

  // Click the add file button
  await addFileButton.click();

  // Wait for the notification to appear (error should show quickly)
  await page.waitForSelector('.mantine-Notifications-notification', { timeout: 10000 });

  // Verify the file was not added to the explorer
  await assertFileExplorerItems([]);

  // Wait for error notification to appear
  const notification = page.locator('.mantine-Notifications-notification');
  await expect(notification).toBeVisible();
  await expect(notification.getByText('Error', { exact: true })).toBeVisible();
  // The actual error message from DuckDB
  await expect(notification.getByText(/Failed to import oversized_line/)).toBeVisible();
});

test('should show generic error for other CSV import failures', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  assertFileExplorerItems,
  page,
}) => {
  // Create a completely invalid file that's not a CSV
  const csvPath = testTmp.join('invalid.csv');

  // Create binary content that will cause DuckDB to fail
  const buffer = Buffer.alloc(1000);
  buffer.fill(0xff); // Fill with binary data

  // Write the invalid file
  fs.writeFileSync(csvPath, buffer);

  // Upload the file
  await storage.uploadFile(csvPath, 'invalid.csv');

  // Patch the file picker
  await filePicker.selectFiles(['invalid.csv']);

  // Click the add file button
  await addFileButton.click();

  // Wait for the notification to appear (error should show quickly)
  await page.waitForSelector('.mantine-Notifications-notification', { timeout: 10000 });

  // Verify the file was not added to the explorer
  await assertFileExplorerItems([]);

  // Wait for error notification to appear with generic error message
  const notification = page.locator('.mantine-Notifications-notification');
  await expect(notification).toBeVisible();
  await expect(notification.getByText('Error', { exact: true })).toBeVisible();
  await expect(notification.getByText(/Failed to import invalid/)).toBeVisible();
});

// Note: Out of memory error handling is implemented in the code
// When DuckDB throws an "Out of Memory" error, users will see:
// "CSV file [filename] is too large to process. Try splitting it into smaller files."
