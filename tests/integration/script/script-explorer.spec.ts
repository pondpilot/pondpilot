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

test('Switch between tabs using script explorer', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  openScriptFromExplorer,
  getScriptEditorContent,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript('select 1');
  await createScriptAndSwitchToItsTab();
  await expect(await getScriptEditorContent()).toContainText('');
  await openScriptFromExplorer('query.sql');
  await expect(await getScriptEditorContent()).toContainText('select 1');
});

test('Select items in the query explorer list using Hotkeys', async ({
  page,
  createScriptAndSwitchToItsTab,
  assertScriptExplorerItems,
  clickScriptByIndex,
  selectMultipleScriptNodes,
  deselectAllScripts,
  switchToTab,
  assertScriptNodesSelection,
}) => {
  const count = 3;

  // Create query tabs
  for (let i = 0; i < count; i += 1) {
    await createScriptAndSwitchToItsTab();
  }

  // Check all created
  assertScriptExplorerItems(['query.sql', 'query_1.sql', 'query_2.sql']);
  await assertScriptNodesSelection([2]);

  // Select second script
  await clickScriptByIndex(1);
  await assertScriptNodesSelection([1]);

  // Select all items using ControlOrMeta + A
  await clickScriptByIndex(1);
  await page.keyboard.press('ControlOrMeta+A');
  await assertScriptNodesSelection([0, 1, 2]);

  // Deselect all items using Escape
  await deselectAllScripts();

  // This whould implicitly activate the first before last item
  // (tab automatically switches) but it is not considered a selection
  await assertScriptNodesSelection([]);

  // Reselect the first item
  await clickScriptByIndex(0);
  // Select specific items (first and third)
  await selectMultipleScriptNodes([0, 2]);
  await assertScriptNodesSelection([0, 2]);

  // // Click elsewhere. Should deselect all
  await page.click('body');
  await assertScriptNodesSelection([]);

  // // Now try to switch to one of the selected tabs via tab pane. It should reset the first item selection
  await switchToTab('query_2');
  await assertScriptNodesSelection([2]);

  // // Finally, switching to a tab from unselected script, should deselect all
  // // and then select the chosen tab
  await switchToTab('query_1');
  await assertScriptNodesSelection([1]);
});

test('Create new script with Alt+N hotkey', async ({
  createScriptAndSwitchToItsTab,
  page,
  scriptEditorContent,
  assertScriptExplorerItems,
  getScriptEditorContent,
}) => {
  // Create initial script tab
  await createScriptAndSwitchToItsTab();

  // Type 'select' in the editor
  const editor = scriptEditorContent;
  await editor.fill('select');
  await expect(editor).toContainText('select');

  // Press Alt+N (Option+N on Mac) to create a new script
  await page.keyboard.press('Alt+n');

  // Verify that a new script named "query_1.sql" appears in the explorer
  await assertScriptExplorerItems(['query.sql', 'query_1.sql']);

  // Verify that the new script editor is empty
  await expect(await getScriptEditorContent()).toContainText('');
});

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
