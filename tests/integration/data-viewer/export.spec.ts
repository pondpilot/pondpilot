import { readFileSync } from 'fs';

import { expect, mergeTests } from '@playwright/test';

import { test as dataViewTest } from '../fixtures/data-view';
import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorer } from '../fixtures/script-explorer';
import { test as tabTest } from '../fixtures/tab';
import { test as testTmpTest } from '../fixtures/test-tmp';

const test = mergeTests(
  baseTest,
  tabTest,
  scriptEditorTest,
  dataViewTest,
  testTmpTest,
  scriptExplorer,
);

test('should export data to CSV', async ({
  testTmp,
  exportTableToCSV,
  assertDataTableMatches,
  fillScript,
  runScript,
  createScriptAndSwitchToItsTab,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(`
  select
    'normal val' as normal_col,
    'comma,val' as 'comma,col',
    'comma quote, "val"' as 'comma quote,"col"'
`);
  await runScript();

  await assertDataTableMatches({
    data: [['normal val', 'comma,val', 'comma quote, "val"']],
    columnNames: ['normal_col', 'comma,col', 'comma quote,"col"'],
  });

  // Export the table to CSV
  const pathToSave = testTmp.join('export.csv');
  await exportTableToCSV(pathToSave);

  // Check content of the CSV file
  const fileContent = readFileSync(pathToSave, 'utf-8');
  const expectedCSV = [
    'normal_col,"comma,col","comma quote,""col"""',
    'normal val,"comma,val","comma quote, ""val"""',
  ].join('\n');
  expect(fileContent).toBe(expectedCSV);
});
