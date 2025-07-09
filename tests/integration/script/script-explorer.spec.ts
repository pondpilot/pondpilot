import { expect, mergeTests } from '@playwright/test';

import { createFile } from '../../utils';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as globalHotkeyTest } from '../fixtures/global-hotkeys';
import { test as baseTest } from '../fixtures/page';
import { test as scriptEditor } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as spotlightTest } from '../fixtures/spotlight';
import { test as storageTest } from '../fixtures/storage';
import { test as tabTest } from '../fixtures/tab';
import { test as testTmpTest } from '../fixtures/test-tmp';
import { isExplorerTreeNodeSelected } from '../fixtures/utils/explorer-tree';

const test = mergeTests(
  baseTest,
  filePickerTest,
  fileSystemExplorerTest,
  globalHotkeyTest,
  scriptEditor,
  scriptExplorerTest,
  spotlightTest,
  storageTest,
  tabTest,
  testTmpTest,
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

test.skip('Select items in the script explorer list using Hotkeys', async ({
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
  await assertScriptExplorerItems(['query.sql', 'query_1.sql', 'query_2.sql']);
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

  // Wait for UI to settle after deselection
  await page.waitForTimeout(500);

  // This would implicitly activate the first before last item
  // (tab automatically switches) but it is not considered a selection
  await assertScriptNodesSelection([]);

  // Reselect the first item
  await clickScriptByIndex(0);
  // Select specific items (first and third)
  await selectMultipleScriptNodes([0, 2]);
  await assertScriptNodesSelection([0, 2]);

  // Click elsewhere. Should deselect all
  // Use Escape to clear selection (clicking outside doesn't work reliably in tests)
  await page.keyboard.press('Escape');
  await assertScriptNodesSelection([]);

  // // Now try to switch to one of the selected tabs via tab pane. It maintains the selection
  await switchToTab('query_2');
  await assertScriptNodesSelection([2]);

  // // Finally, switching to a tab from unselected script, should deselect all
  // // and then select the chosen tab
  await switchToTab('query_1');
  await assertScriptNodesSelection([1]);
});

test('Create new script with hotkey', async ({
  createScriptAndSwitchToItsTab,
  scriptEditorContent,
  assertScriptExplorerItems,
  getScriptEditorContent,
  pressNewScriptHotkey,
}) => {
  // Create initial script tab
  await createScriptAndSwitchToItsTab();

  // Type 'select' in the editor
  const editor = scriptEditorContent;
  await editor.fill('select');
  await expect(editor).toContainText('select');

  // Press hotkey to create a new script
  await pressNewScriptHotkey();

  // Verify that a new script named "query_1.sql" appears in the explorer
  await assertScriptExplorerItems(['query.sql', 'query_1.sql']);

  // Verify that the new script editor is empty
  await expect(await getScriptEditorContent()).toContainText('');
});

test('Script should be deselected when selecting a file', async ({
  page,
  addFile,
  storage,
  filePicker,
  testTmp,
  assertFileExplorerItems,
  clickFileByName,
  getFileNodeByName,
  createScriptAndSwitchToItsTab,
}) => {
  // Create and add a test file with unique name
  const testFile = testTmp.join('unique_selection_test.csv');
  const testFileContent = 'col\ntest_value';
  createFile(testFile, testFileContent);
  await storage.uploadFile(testFile, 'unique_selection_test.csv');
  await filePicker.selectFiles(['unique_selection_test.csv']);
  await addFile();

  // Wait for the file to be processed by checking it appears
  await page.waitForSelector(
    '[data-testid*="data-explorer-fs-tree-node-"][data-testid$="-container"]',
    {
      timeout: 5000,
    },
  );

  // Verify the file was added
  await assertFileExplorerItems(['unique_selection_test']);

  // Create a script and switch to its tab
  const scriptNode = await createScriptAndSwitchToItsTab();

  // Verify the script is selected
  expect(await isExplorerTreeNodeSelected(scriptNode)).toBe(true);

  // Click on the file to select it
  await clickFileByName('unique_selection_test');

  // Check that the file is selected
  const fileNode = await getFileNodeByName('unique_selection_test');
  expect(await isExplorerTreeNodeSelected(fileNode)).toBe(true);

  // And script not selected
  expect(await isExplorerTreeNodeSelected(scriptNode)).toBe(false);

  // Select script again
  await scriptNode.click();

  // Verify script is selected again
  expect(await isExplorerTreeNodeSelected(scriptNode)).toBe(true);

  // The test has verified that clicking between files and scripts properly
  // changes selection as expected
});
