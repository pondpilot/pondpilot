import * as fs from 'fs';

import { mergeTests } from '@playwright/test';

import { test as dataViewTest } from '../fixtures/data-view';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as baseTest } from '../fixtures/page';

const test = mergeTests(baseTest, filePickerTest, dataViewTest);

test('should handle CSV files with very large lines', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  openFileFromExplorer,
  assertDataTableMatches,
  assertFileExplorerItems,
}) => {
  // Create a CSV file with a very large line (> 2MB)
  const csvPath = testTmp.join('large_line.csv');

  // Create header
  const header = 'id,data\n';

  // Create a row with a very large data field (3.2MB to exceed the default 2MB limit)
  const largeDataSize = 3200000; // 3.2MB
  const largeData = 'x'.repeat(largeDataSize);
  const row1 = `1,'${largeData}'\n`;
  const row2 = "2,'small data'\n";

  // Write the CSV file
  fs.writeFileSync(csvPath, header + row1 + row2);

  // Upload the file
  await storage.uploadFile(csvPath, 'large_line.csv');

  // Patch the file picker
  await filePicker.selectFiles(['large_line.csv']);

  // Click the add file button
  await addFileButton.click();

  // Verify explorer items
  await assertFileExplorerItems(['large_line']);

  // Try to open the file - this should either work with the fix or show an error
  await openFileFromExplorer('large_line');

  // Check if we can see the data or if there's an error
  // With the fix, we should see the data (truncated for display)
  const truncatedLargeData = `${'x'.repeat(1000)}...`;
  await assertDataTableMatches({
    data: [
      ['1', truncatedLargeData],
      ['2', 'small data'],
    ],
    columnNames: ['id', 'data'],
  });
});

test('should handle CSV files with multiple large lines', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  openFileFromExplorer,
  assertDataTableMatches,
  assertFileExplorerItems,
}) => {
  // Create a CSV file with multiple large lines
  const csvPath = testTmp.join('multiple_large_lines.csv');

  // Create header
  const header = 'id,description,data\n';

  // Create multiple rows with large data fields
  const largeDataSize = 1500000; // 1.5MB per field
  const largeData1 = 'a'.repeat(largeDataSize);
  const largeData2 = 'b'.repeat(largeDataSize);
  const largeData3 = 'c'.repeat(largeDataSize);

  const rows = [
    `1,'First large row','${largeData1}'\n`,
    `2,'Second large row','${largeData2}'\n`,
    `3,'Third large row','${largeData3}'\n`,
  ];

  // Write the CSV file
  fs.writeFileSync(csvPath, header + rows.join(''));

  // Upload the file
  await storage.uploadFile(csvPath, 'multiple_large_lines.csv');

  // Patch the file picker
  await filePicker.selectFiles(['multiple_large_lines.csv']);

  // Click the add file button
  await addFileButton.click();

  // Verify explorer items
  await assertFileExplorerItems(['multiple_large_lines']);

  // Open the file
  await openFileFromExplorer('multiple_large_lines');

  // Verify we can see all the data (truncated for display)
  const truncatedData1 = `${'a'.repeat(1000)}...`;
  const truncatedData2 = `${'b'.repeat(1000)}...`;
  const truncatedData3 = `${'c'.repeat(1000)}...`;
  await assertDataTableMatches({
    data: [
      ['1', 'First large row', truncatedData1],
      ['2', 'Second large row', truncatedData2],
      ['3', 'Third large row', truncatedData3],
    ],
    columnNames: ['id', 'description', 'data'],
  });
});
