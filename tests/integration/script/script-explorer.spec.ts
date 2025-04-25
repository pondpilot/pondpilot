import { expect, mergeTests } from '@playwright/test';
import { test as baseTest } from '../fixtures/page';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as tabTest } from '../fixtures/tab';
import { test as scriptEditorTest } from '../fixtures/script-editor';

const test = mergeTests(baseTest, scriptExplorerTest, tabTest, scriptEditorTest);

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
