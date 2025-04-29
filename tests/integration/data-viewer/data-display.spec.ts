import { mergeTests } from '@playwright/test';
import { test as baseTest } from '../fixtures/page';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as dataViewTest } from '../fixtures/data-view';

const test = mergeTests(baseTest, scriptExplorerTest, scriptEditorTest, dataViewTest);

test('Decimals are displayed corretly', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  assertDataTableMatches,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(`
    select
      sum(col1) as col1,
      0.5 as col2,
      (-123.123)::DECIMAL(10,2) as col3,
      1::INT128 as col4
    from (
      select 1 as col1
      union select 2 as col1
    )
  `);
  await runScript();
  await assertDataTableMatches({
    data: [[3, 0.5, -123.12, 1]],
    columnNames: ['col1', 'col2', 'col3', 'col4'],
  });
});

test('Display columns with duplicate names', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  assertDataTableMatches,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(`
   SELECT 
    'col 1' AS column_name, 
    'col 2' AS column_name,
    'col 3' AS column_name_1;
  `);
  await runScript();
  await assertDataTableMatches({
    data: [['col 1', 'col 2', 'col 3']],
    columnNames: ['column_name', 'column_name', 'column_name_1'],
  });
});
