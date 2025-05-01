import { expect, mergeTests } from '@playwright/test';

import { createFile } from '../../utils';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as baseTest } from '../fixtures/page';
import { test as scriptEditor } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as spotlightTest } from '../fixtures/spotlight';
import { test as storageTest } from '../fixtures/storage';
import { test as tabTest } from '../fixtures/tab';
import { test as testTmpTest } from '../fixtures/test-tmp';

const test = mergeTests(
  baseTest,
  scriptExplorerTest,
  tabTest,
  storageTest,
  filePickerTest,
  testTmpTest,
  fileSystemExplorerTest,
  scriptEditor,
  spotlightTest,
);

test('File should be deselected after creating script from it', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  createScriptFromFileExplorer,
  assertFileExplorerItems,
  clickFileByName,
  getFileNodeByName,
  createScriptViaSpotlight,
}) => {
  // Create and add a test file
  const testFile = testTmp.join('test_selection.csv');
  const testFileContent = 'col\ntest_value';
  createFile(testFile, testFileContent);
  await storage.uploadFile(testFile, 'test_selection.csv');
  await filePicker.selectFiles(['test_selection.csv']);
  await addFileButton.click();

  // Verify the file was added
  await assertFileExplorerItems(['test_selection']);

  // Click on the file to select it
  await clickFileByName('test_selection');

  // Check that the file is selected (has data-selected="true")
  const fileNode = await getFileNodeByName('test_selection');
  // Select the file node
  fileNode.click();
  // Check that the file is selected (data-selected="true")
  await expect(fileNode).toHaveAttribute('data-selected', 'true');

  // Create a script from the file
  await createScriptFromFileExplorer('test_selection');
  // Check that the file is now deselected (data-selected changed to "false" or is absent)
  await expect(fileNode).toHaveAttribute('data-selected', 'false');

  // Select the file again
  await clickFileByName('test_selection');
  await expect(fileNode).toHaveAttribute('data-selected', 'true');

  // Create a new script using spotlight and verify file gets deselected
  await createScriptViaSpotlight();

  // Check that the file selection is cleared after creating script via spotlight
  await expect(fileNode).toHaveAttribute('data-selected', 'false');
});
