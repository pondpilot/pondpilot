import { mergeTests } from '@playwright/test';

import { test as dataViewTest } from '../integration/fixtures/data-view';
import { test as pageTest } from '../integration/fixtures/page';
import { test as scriptEditorTest } from '../integration/fixtures/script-editor';
import { test as scriptExplorerTest } from '../integration/fixtures/script-explorer';

const test = mergeTests(pageTest, scriptExplorerTest, scriptEditorTest, dataViewTest);

test('opens the app and executes a local DuckDB query', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  assertDataTableMatches,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript("SELECT 42 AS answer, 'compatible' AS status;");
  await runScript();
  await assertDataTableMatches({
    columnNames: ['answer', 'status'],
    data: [[42, 'compatible']],
  });
});
