import { mergeTests } from '@playwright/test';

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
  filePickerTest,
  dataViewTest,
  storageTest,
  testTmpTest,
  waitUtilsTest,
  fileSystemExplorerTest,
);

test('Should handle CSV schema changes when sorting after file modification', async ({
  testTmp,
  storage,
  filePicker,
  addFileButton,
  openFileFromExplorer,
  waitForDataTable,
  assertDataTableMatches,
  waitForFilesToBeProcessed,
}) => {
  // Step 1: Create initial CSV file with simple schema
  const csvPath = testTmp.join('bug-118-test.csv');
  createFile(csvPath, 'id,name\n1,Alice\n2,Bob');

  // Step 2: Upload and add file to PondPilot
  await storage.uploadFile(csvPath, 'bug-118-test.csv');
  await filePicker.selectFiles(['bug-118-test.csv']);
  await addFileButton.click();
  await waitForFilesToBeProcessed();

  // Step 3: Open file and verify initial data
  await openFileFromExplorer('bug-118-test');
  const dataTable = await waitForDataTable();

  await assertDataTableMatches({
    data: [
      ['1', 'Alice'],
      ['2', 'Bob'],
    ],
    columnNames: ['id', 'name'],
  });

  // Step 4: Test sorting works with initial schema
  const initialSortButton = dataTable.getByTestId('data-table-header-cell-sort-name');
  await initialSortButton.click();

  // Step 5: Modify CSV file externally - add new column and data
  createFile(csvPath, 'id,name,department\n1,Alice,Engineering\n2,Bob,Marketing\n3,Charlie,Sales');
  await storage.uploadFile(csvPath, 'bug-118-test.csv');

  // Step 6: Try to sort again - this should trigger schema mismatch error and auto-recovery
  await initialSortButton.click();

  // Step 7: Verify that new schema is detected and displayed
  await assertDataTableMatches({
    data: [
      ['3', 'Charlie', 'Sales'],
      ['2', 'Bob', 'Marketing'],
      ['1', 'Alice', 'Engineering'],
    ],
    columnNames: ['id', 'name', 'department'],
  });
});
