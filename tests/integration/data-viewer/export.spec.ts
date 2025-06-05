import { readFileSync } from 'fs';

import { MarkdownExportOptions } from '@models/export-options';
import { expect, mergeTests } from '@playwright/test';
import * as XLSX from 'xlsx';

import { DataTable, DBTableOrViewSchema } from '../../../src/models/db';
import {
  toXmlString,
  toMarkdownString,
  toSqlString,
  toCsvString,
  toTsvString,
} from '../../../src/utils/export-data';
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

test('should export data to CSV (via modal)', async ({
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

  // Standard export
  const path1 = testTmp.join('export1.csv');
  await exportTableToCSVAdvanced({
    path: path1,
    delimiter: ',',
    quoteChar: '"',
    escapeChar: '"',
    includeHeader: true,
    filename: 'export1.csv',
  });
  const fileContent1 = readFileSync(path1, 'utf-8');
  const columns = [
    { name: 'normal_col', id: '1', sqlType: 'string' },
    { name: 'comma,col', id: '2', sqlType: 'string' },
    { name: 'comma quote,"col"', id: '3', sqlType: 'string' },
  ] as DBTableOrViewSchema;
  const data = [
    {
      ['1' as any]: 'normal val',
      ['2' as any]: 'comma,val',
      ['3' as any]: 'comma quote, "val"',
    },
  ] as DataTable;
  const options = {
    delimiter: ',',
    quoteChar: '"',
    escapeChar: '"',
    includeHeader: true,
  };
  const expectedCSV1 = toCsvString(columns as any, data, options as any);
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
    'comma\tval' as tab_col,
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
  const columns = [
    { name: 'normal_col', id: '1', sqlType: 'string' },
    { name: 'tab_col', id: '2', sqlType: 'string' },
    { name: 'tab quote,"col"', id: '3', sqlType: 'string' },
  ] as DBTableOrViewSchema;
  const data = [
    {
      ['1' as any]: 'normal val',
      ['2' as any]: 'comma\tval',
      ['3' as any]: 'tab quote\t"val"',
    },
  ] as DataTable;
  const options = {
    delimiter: '\t',
    quoteChar: '"',
    escapeChar: '"',
    includeHeader: true,
  };
  const expectedTSV1 = toTsvString(columns as any, data, options as any);
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

  // Формируем схему и данные только с name, id, sqlType
  const columns = [
    { name: 'normal_col', id: '1', sqlType: 'string', nullable: true },
    { name: 'comma_col', id: '2', sqlType: 'string', nullable: true },
    { name: 'sql_quote_col', id: '3', sqlType: 'string', nullable: true },
  ] as DBTableOrViewSchema;
  const data = [
    {
      ['1' as any]: 'normal val',
      ['2' as any]: 'comma,val',
      ['3' as any]: 'sql "quote"',
    },
  ] as DataTable;
  const options = {
    tableName: 'exported_table',
    includeCreateTable: true,
    includeDataTypes: true,
    includeHeader: true,
  };
  const expectedSQL = toSqlString(columns as any, data, options as any);
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

  // Формируем схему и данные только с name и id
  const columns = [
    { name: 'normal_col', id: '1' },
    { name: 'comma_col', id: '2' },
    { name: 'sql_quote_col', id: '3' },
  ] as DBTableOrViewSchema;
  const data = [
    {
      ['1' as any]: 'normal val',
      ['2' as any]: 'comma,val',
      ['3' as any]: 'sql "quote"',
    },
  ] as DataTable;
  const options = { rootElement: 'data', rowElement: 'row', includeHeader: true };
  const expectedXML = toXmlString(columns as any, data, options);
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
  const columns = [
    { name: 'normal_col', id: '1', sqlType: 'string' },
    { name: 'comma_col', id: '2', sqlType: 'string' },
    { name: 'md_pipe_col', id: '3', sqlType: 'string' },
  ] as DBTableOrViewSchema;
  const data = [
    {
      ['1' as any]: 'normal val',
      ['2' as any]: 'comma,val',
      ['3' as any]: 'md | pipe',
    },
  ] as DataTable;
  const optionsAligned: MarkdownExportOptions = {
    alignColumns: true,
    format: 'github',
    includeHeader: true,
  };
  const expectedMd1 = toMarkdownString(columns as any, data, optionsAligned);
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
  const optionsNoAlign: MarkdownExportOptions = {
    alignColumns: false,
    format: 'github',
    includeHeader: true,
  };
  const expectedMd2 = toMarkdownString(columns as any, data, optionsNoAlign);
  expect(fileContent2).toBe(expectedMd2);
});
