import * as fs from 'fs';

import { mergeTests } from '@playwright/test';

import { test as dataViewTest } from '../fixtures/data-view';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as notificationTest } from '../fixtures/notifications';
import { test as baseTest } from '../fixtures/page';

const test = mergeTests(baseTest, filePickerTest, dataViewTest, notificationTest);

test('should show generic error for invalid CSV files', async ({
  addFile,
  storage,
  filePicker,
  testTmp,
  assertFileExplorerItems,
  expectErrorNotification,
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
  await addFile();

  // Verify the file was not added to the explorer
  await assertFileExplorerItems([]);

  // Wait for error notification with the expected message
  await expectErrorNotification(/Failed to import invalid/);
});
