import { mergeTests } from '@playwright/test';
import { test as baseTest } from '../fixtures/page';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as dataViewTest } from '../fixtures/data-view';

const test = mergeTests(baseTest, scriptExplorerTest, scriptEditorTest, dataViewTest);

test('Create and run simple script', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  assertDataTableMatches,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript('select 1');
  await runScript();
  await assertDataTableMatches({
    data: [[1]],
    columnNames: ['1'],
  });
});
