import { expect, mergeTests } from '@playwright/test';
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
  await assertDataTableMatches({ col1: [3], col2: [0.5], col3: [-123.12], col4: [1] });
});

test('Column duplicates are not displayed', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  assertDataTableMatches,
  page,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(`
   SELECT 
    'col 1' AS column_name, 
    'col 2' AS column_name;
  `);
  await runScript();
  await assertDataTableMatches({ column_name: ['col 2'] });
  const duplicatedColumnsText = page
    .getByText('The following columns are duplicated: column_name')
    .first();
  await expect(duplicatedColumnsText).toBeVisible();
});
