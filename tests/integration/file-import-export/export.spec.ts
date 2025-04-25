import { expect, mergeTests } from '@playwright/test';
import { readFileSync } from 'fs';
import { test as baseTest } from '../fixtures/page';
import { test as storageTest } from '../fixtures/storage';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as testTmpTest } from '../fixtures/test-tmp';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as dataViewTest } from '../fixtures/data-view';
import { test as scriptEditor } from '../fixtures/script-editor';
import { createFile } from '../../utils';

const test = mergeTests(
  baseTest,
  storageTest,
  filePickerTest,
  testTmpTest,
  fileSystemExplorerTest,
  dataViewTest,
  scriptEditor,
);

// TODO: Use IDs instead of names

test('roundtrip csv file with quotes and commas', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  createScriptFromFileExplorer,
  runScript,
  assertDataTableMatches,
  assertFileExplorerItems,
  exportTableToCSV,
}) => {
  // Create a test file
  const testFile = testTmp.join('test_file.csv');
  const testFileContent = '"col,""name"\n"all in: comma, dobule"""",\nafter newline"';
  createFile(testFile, testFileContent);
  // Prepare test files
  await storage.uploadFile(testFile, 'test_file.csv');
  // Patch the file picker
  await filePicker.selectFiles(['test_file.csv']);
  // Click the add file button
  await addFileButton.click();
  // Verify explorer items
  await assertFileExplorerItems(['test_file']);
  // Verify file viewer
  await createScriptFromFileExplorer('test_file');
  await runScript();
  // TODO: Duckdb-Wasm that we currently use incorrectly parses the CSV, it doesn't
  // unqote the double double quotes. Update the test when we upgrade to reader that properly
  // handles this case.
  await assertDataTableMatches({ 'col,""name': ['all in: comma, dobule"""",\nafter newline'] });
  // Export the table to CSV
  const pathToSave = testTmp.join('exported_file.csv');
  await exportTableToCSV(pathToSave);
  // Compare the exported file with the original file
  const fileContent = readFileSync(pathToSave, 'utf-8');

  // FIXME: The exported file is not the same as the original file, becase
  // see above - duckdb-wasm doesn't handle the double quotes correctly, and
  // we quote them again when exporting.
  expect(fileContent).toBe('"col,""""name"\n"all in: comma, dobule"""""""",\nafter newline"');
});
