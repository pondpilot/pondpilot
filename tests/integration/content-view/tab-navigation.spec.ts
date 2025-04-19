import { expect, mergeTests } from '@playwright/test';
import { test as baseTest } from '../fixtures/page';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as tabTest } from '../fixtures/tab';
import { test as scriptEditorTest } from '../fixtures/script-editor';

const test = mergeTests(baseTest, scriptExplorerTest, tabTest, scriptEditorTest);

test('Close and reopen script', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  closeActiveTab,
  openScriptFromExplorer,
  scriptEditorContent,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript('select 1');
  await closeActiveTab();
  await openScriptFromExplorer('query.sql');
  await expect(scriptEditorContent).toContainText('select 1');
});

test('Switch between tabs using tabs pane', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  switchToTab,
  getScriptEditorContent,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript('select 1');
  await createScriptAndSwitchToItsTab();
  await expect(await getScriptEditorContent()).toContainText('');
  await switchToTab('query');
  await expect(await getScriptEditorContent()).toContainText('select 1');
});

test('Create two queries with different content and switch between them', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  switchToTab,
  getScriptEditorContent,
}) => {
  // Create and fill first script
  await createScriptAndSwitchToItsTab();
  await fillScript('select 1 as first_query');

  // Create and fill second script
  await createScriptAndSwitchToItsTab();
  await fillScript('select 2 as second_query');

  // Switch back to first script and verify content
  await switchToTab('query');
  await expect(await getScriptEditorContent()).toContainText('select 1 as first_query');

  // Switch back to second script and verify content
  await switchToTab('query_1');
  await expect(await getScriptEditorContent()).toContainText('select 2 as second_query');
});
