import { readFileSync } from 'fs';
import { expect, mergeTests } from '@playwright/test';
import { test as baseTest } from '../fixtures/page';
import { test as tabTest } from '../fixtures/tab';
import { test as queryEditorTest } from '../fixtures/query-editor';
import { test as dataViewTest } from '../fixtures/data-view';
import { test as testTmpTest } from '../fixtures/test-tmp';

const test = mergeTests(baseTest, tabTest, queryEditorTest, dataViewTest, testTmpTest);

test('should export data to CSV', async ({
  testTmp,
  exportTableToCSV,
  assertDataTableMatches,
  createQueryAndSwitchToItsTab,
  fillQuery,
  runQuery,
}) => {
  await createQueryAndSwitchToItsTab();
  await fillQuery(`
  select
    'normal val' as normal_col,
    'comma,val' as 'comma,col',
    'comma quote, "val"' as 'comma quote,"col"'
`);
  await runQuery();
  await assertDataTableMatches({
    normal_col: ['normal val'],
    'comma,col': ['comma,val'],
    'comma quote,"col"': ['comma quote, "val"'],
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
