import { expect, mergeTests } from '@playwright/test';
import { readFileSync } from 'fs';
import { test as baseTest } from '../fixtures/page';
import { test as storageTest } from '../fixtures/storage';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as testTmpTest } from '../fixtures/test-tmp';
import { test as fileExplorerTest } from '../fixtures/file-system-explorer';
import { test as dataViewTest } from '../fixtures/data-view';
import { test as spotlightTest } from '../fixtures/spotlight';
import { test as queryEditorTest } from '../fixtures/script-explorer';
import { test as scriptEditor } from '../fixtures/script-editor';
import { createFile } from '../../utils';

const test = mergeTests(
  baseTest,
  storageTest,
  filePickerTest,
  testTmpTest,
  fileExplorerTest,
  queryEditorTest,
  dataViewTest,
  spotlightTest,
  scriptEditor,
);

test.describe('flaky test group with retries', () => {
  test.describe.configure({ retries: 5 });

  // eslint-disable-next-line playwright/no-skipped-test
  test.skip('should add csv files', async ({
    page,
    storage,
    filePicker,
    testTmp,
    openFileFromExplorer,
    assertDataTableMatches,
    assertFileExplorerItems,
    addDirectoryViaSpotlight,
    reloadPage,
  }) => {
    // Test single file
    const test1 = testTmp.join('test1.csv');
    createFile(test1, 'id,name\n1,test1\n2,test2');
    // Prepare test files
    await storage.uploadFile(test1, 'test1.csv');
    // Patch the file picker
    await filePicker.selectFiles(['test1.csv']);
    // Click the add file button
    await page.getByTestId('navbar-add-file-button').click();
    // Verify explorer items
    await assertFileExplorerItems(['test1']);
    // Verify file viewer
    await openFileFromExplorer('test1');
    await assertDataTableMatches({ id: [1, 2], name: ['test1', 'test2'] });

    // Test multiple files
    const test2 = testTmp.join('test2.csv');
    createFile(test2, 'col\ntest2');
    const test3 = testTmp.join('test3.csv');
    createFile(test3, 'col\ntest3');
    // Prepare test files
    await storage.uploadFile(test2, 'select_two_files/test2.csv');
    await storage.uploadFile(test3, 'select_two_files/test3.csv');
    // Patch the file picker
    await filePicker.selectFiles(['select_two_files/test2.csv', 'select_two_files/test3.csv']);
    // Click the add file button
    await page.getByTestId('navbar-add-file-button').click();
    // Verify explorer items
    await assertFileExplorerItems(['test1', 'test2', 'test3']);
    // Verify file viewer
    await openFileFromExplorer('test2');
    await assertDataTableMatches({ col: ['test2'] });
    await openFileFromExplorer('test3');
    await assertDataTableMatches({ col: ['test3'] });

    // Test directory
    const testDirFile1 = testTmp.join('dir', 'test_dir_file1.csv');
    createFile(testDirFile1, 'col\ntest_dir_file1');
    const testDirFile2 = testTmp.join('dir', 'test_dir_file2.csv');
    createFile(testDirFile2, 'col\ntest_dir_file2');
    // Upload directory
    await storage.uploadDir(testTmp.join('dir'), 'test_dir');
    // Patch the file picker
    await filePicker.selectDir('test_dir');
    // Click the add folder button
    await addDirectoryViaSpotlight();
    // Verify explorer items
    await assertFileExplorerItems(
      ['test1', 'test2', 'test3', 'test_dir_file1', 'test_dir_file2'].sort((a, b) =>
        a.localeCompare(b),
      ),
    );
    // Verify file viewer
    await openFileFromExplorer('test_dir_file1');
    await assertDataTableMatches({ col: ['test_dir_file1'] });
    await openFileFromExplorer('test_dir_file2');
    await assertDataTableMatches({ col: ['test_dir_file2'] });

    // Test remove files
    await storage.removeEntry('test1.csv');
    await storage.removeEntry('test_dir');
    // Reload the page
    await reloadPage();
    // Verify explorer items
    await assertFileExplorerItems(['test2', 'test3']);
  });

  // TODO: Use IDs instead of names
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip('roundtrip csv file with quotes and commas', async ({
    page,
    storage,
    filePicker,
    testTmp,
    createQueryFromFileExplorer,
    runScript,
    assertDataTableMatches,
    assertFileExplorerItems,
    exportTableToCSV,
  }) => {
    // Create a test file
    const testFile = testTmp.join('test_file.csv');
    const testFileContent = '"col,""name"\n"some,""value"';
    createFile(testFile, testFileContent);
    // Prepare test files
    await storage.uploadFile(testFile, 'test_file.csv');
    // Patch the file picker
    await filePicker.selectFiles(['test_file.csv']);
    // Click the add file button
    await page.getByTestId('navbar-add-file-button').click();
    // Verify explorer items
    await assertFileExplorerItems(['test_file']);
    // Verify file viewer
    await createQueryFromFileExplorer('test_file');
    await runScript();
    await assertDataTableMatches({ 'col,"name': ['some,"value'] });
    // Export the table to CSV
    const pathToSave = testTmp.join('exported_file.csv');
    await exportTableToCSV(pathToSave);
    // Compare the exported file with the original file
    const fileContent = readFileSync(pathToSave, 'utf-8');
    expect(fileContent).toBe(testFileContent);
  });
});
