import { readFileSync } from 'fs';

import { expect, mergeTests } from '@playwright/test';
import * as XLSX from 'xlsx';

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

test('Should export data to CSV (via modal)', async ({
  testTmp,
  exportTableToCSVAdvanced,
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

  // Option 1: standard export
  const path1 = testTmp.join('export1.csv');
  await exportTableToCSVAdvanced({
    path: path1,
    delimiter: ',',
    includeHeader: true,
    filename: 'export1.csv',
  });
  const fileContent1 = readFileSync(path1, 'utf-8');
  const expectedCSV1 = [
    'normal_col,"comma,col","comma quote,""col"""',
    'normal val,"comma,val","comma quote, ""val"""',
  ].join('\n');
  expect(fileContent1).toBe(expectedCSV1);
});

test('should export data to TSV (via modal)', async ({
  testTmp,
  exportTableToTSVAdvanced,
  fillScript,
  runScript,
  createScriptAndSwitchToItsTab,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(`
  select
    'normal val' as normal_col,
    'comma\tval' as 'tab_col',
    'tab quote\t"val"' as 'tab quote,"col"'
`);
  await runScript();

  // Standard TSV export
  const path1 = testTmp.join('export1.tsv');
  await exportTableToTSVAdvanced({
    path: path1,
    quoteChar: '"',
    escapeChar: '"',
    includeHeader: true,
    filename: 'export1.tsv',
  });
  const fileContent1 = readFileSync(path1, 'utf-8');
  const expectedTSV1 = [
    'normal_col\ttab_col\t"tab quote,""col"""',
    'normal val\tcomma\tval\t"tab quote\t""val"""',
  ].join('\n');
  expect(fileContent1).toBe(expectedTSV1);
});

test('should export data to XLSX (via modal)', async ({
  testTmp,
  exportTableToXLSXAdvanced,
  fillScript,
  runScript,
  createScriptAndSwitchToItsTab,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(`
  select
    'normal val' as normal_col,
    'comma\tval' as 'tab_col',
    'tab quote\t"val"' as 'tab quote,"col"'
`);
  await runScript();

  // Standard XLSX export
  const path1 = testTmp.join('export1.xlsx');
  await exportTableToXLSXAdvanced({
    path: path1,
    includeHeader: true,
    sheetName: 'Sheet1',
    filename: 'export1.xlsx',
  });

  // Read and check XLSX file
  const workbook = XLSX.readFile(path1);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  expect(data).toEqual([
    ['normal_col', 'tab_col', 'tab quote,"col"'],
    ['normal val', 'comma\tval', 'tab quote\t"val"'],
  ]);
});

test('should export data to SQL (via modal)', async ({
  testTmp,
  exportTableToSQLAdvanced,
  fillScript,
  runScript,
  createScriptAndSwitchToItsTab,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(`
  select
    'normal val' as normal_col,
    'comma,val' as comma_col,
    'sql "quote"' as sql_quote_col
`);
  await runScript();

  // Standard SQL export
  const path1 = testTmp.join('export1.sql');
  await exportTableToSQLAdvanced({
    path: path1,
    tableName: 'exported_table',
    includeCreateTable: true,
    includeDataTypes: true,
    filename: 'export1.sql',
  });
  const fileContent1 = readFileSync(path1, 'utf-8');

  const expectedSQL = [
    'DROP TABLE IF EXISTS "exported_table";',
    'CREATE TABLE "exported_table" (',
    '  "normal_col" VARCHAR,',
    '  "comma_col" VARCHAR,',
    '  "sql_quote_col" VARCHAR',
    ');',
    '',
    '-- Inserting data into exported_table',
    '-- Columns: normal_col, comma_col, sql_quote_col',
    '',
    'INSERT INTO "exported_table" ("normal_col", "comma_col", "sql_quote_col") VALUES',
    "('normal val', 'comma,val', 'sql \"quote\"');",
    '',
  ].join('\n');
  expect(fileContent1.trim()).toBe(expectedSQL.trim());
});

test('should export data to XML (via modal)', async ({
  testTmp,
  exportTableToXMLAdvanced,
  fillScript,
  runScript,
  createScriptAndSwitchToItsTab,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(`
  select
    'normal val' as normal_col,
    'comma,val' as comma_col,
    'sql "quote"' as sql_quote_col
`);
  await runScript();

  // Standard XML export
  const path1 = testTmp.join('export1.xml');
  await exportTableToXMLAdvanced({
    path: path1,
    includeHeader: true,
    rootElement: 'data',
    rowElement: 'row',
    filename: 'export1.xml',
  });
  const fileContent1 = readFileSync(path1, 'utf-8');
  const expectedXML = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<data>',
    '  <row>',
    '    <normal_col>normal val</normal_col>',
    '    <comma_col>comma,val</comma_col>',
    '    <sql_quote_col>sql &quot;quote&quot;</sql_quote_col>',
    '  </row>',
    '</data>',
    '',
  ].join('\n');
  expect(fileContent1.trim()).toBe(expectedXML.trim());
});

test('should export data to Markdown (via modal)', async ({
  testTmp,
  exportTableToMarkdownAdvanced,
  fillScript,
  runScript,
  createScriptAndSwitchToItsTab,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(`
  select
    'normal val' as normal_col,
    'comma,val' as comma_col,
    'md | pipe' as md_pipe_col
  `);
  await runScript();

  // Standard Markdown export (aligned)
  const path1 = testTmp.join('export1.md');
  await exportTableToMarkdownAdvanced({
    path: path1,
    includeHeader: true,
    mdFormat: 'github',
    alignColumns: true,
    filename: 'export1.md',
  });
  const fileContent1 = readFileSync(path1, 'utf-8');
  const expectedMd1 = [
    '| normal_col | comma_col | md_pipe_col |',
    '| ---------- | --------- | ----------- |',
    '| normal val | comma,val | md | pipe   |',
    '',
  ].join('\n');
  expect(fileContent1).toBe(expectedMd1);

  // Markdown export (no alignment)
  const path2 = testTmp.join('export2.md');
  await exportTableToMarkdownAdvanced({
    path: path2,
    includeHeader: true,
    mdFormat: 'github',
    alignColumns: false,
    filename: 'export2.md',
  });
  const fileContent2 = readFileSync(path2, 'utf-8');
  const expectedMd2 = [
    '| normal_col | comma_col | md_pipe_col |',
    '| --- | --- | --- |',
    '| normal val | comma,val | md | pipe |',
    '',
  ].join('\n');
  expect(fileContent2).toBe(expectedMd2);
});
