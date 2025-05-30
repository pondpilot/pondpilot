import * as fs from 'fs';

import { mergeTests, expect } from '@playwright/test';

import { test as dataViewTest } from '../fixtures/data-view';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as baseTest } from '../fixtures/page';

const test = mergeTests(baseTest, filePickerTest, dataViewTest);

test('should show generic error for invalid CSV files', async ({
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
