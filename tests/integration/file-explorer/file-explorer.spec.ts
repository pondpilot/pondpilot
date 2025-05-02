import { expect, mergeTests } from '@playwright/test';

import { createFile } from '../../utils';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as globalHotkeyTest } from '../fixtures/global-hotkeys';
import { test as baseTest } from '../fixtures/page';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as storageTest } from '../fixtures/storage';
import { test as testTmpTest } from '../fixtures/test-tmp';
import { isExplorerTreeNodeSelected } from '../fixtures/utils/explorer-tree';

const test = mergeTests(
  baseTest,
  scriptExplorerTest,
  storageTest,
  filePickerTest,
  testTmpTest,
  fileSystemExplorerTest,
  globalHotkeyTest,
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
  assertScriptExplorerItems,
  pressNewScriptHotkey,
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

  // Check that the file is selected (has data-selected="true")
  const fileNode = await getFileNodeByName('test_selection');
  // Select the file node
  await fileNode.click();
  // Check that the file is selected
  expect(await isExplorerTreeNodeSelected(fileNode)).toBe(true);

  // Create a script from the file
  await createScriptFromFileExplorer('test_selection');
  // Check that the file is now deselected
  expect(await isExplorerTreeNodeSelected(fileNode)).toBe(false);

  // Select the file again
  await clickFileByName('test_selection');
  expect(await isExplorerTreeNodeSelected(fileNode)).toBe(true);

  // Create a new script using spotlight without mouse interactions
  // and verify file gets deselected
  await pressNewScriptHotkey();

  // Check that we now have 2 scripts
  await assertScriptExplorerItems(['query.sql', 'test_selection_query.sql']);

  // Check that the file selection is cleared after creating script via hotkey
  expect(await isExplorerTreeNodeSelected(fileNode)).toBe(false);
});
