import path from 'path';

import { mergeTests } from '@playwright/test';

import { test as dataViewTest } from '../fixtures/data-view';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as baseTest } from '../fixtures/page';
import { test as storageTest } from '../fixtures/storage';

const test = mergeTests(
  baseTest,
  filePickerTest,
  dataViewTest,
  fileSystemExplorerTest,
  storageTest,
);

test('should import Stata files (.dta)', async ({
  page,
  storage,
  filePicker,
  addFile,
  assertFileExplorerItems,
  openFileFromExplorer,
  assertDataTableMatches,
}) => {
  const fixturePath = path.resolve(__dirname, '../../fixtures/readstat/sample.dta');

  await storage.uploadFile(fixturePath, 'sample.dta');
  await filePicker.selectFiles(['sample.dta']);
  await addFile();

  await page.waitForSelector(
    '[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]',
    {
      timeout: 10000,
    },
  );
  await assertFileExplorerItems(['sample']);
  await openFileFromExplorer('sample');

  await assertDataTableMatches({
    columnNames: ['mychar', 'mynum', 'mydate', 'dtime', 'mylabl', 'myord', 'mytime'],
    data: [
      ['a', '1.1', '2018-05-06', '2018-05-06 10:10:10', '1', '1', '10:10:10'],
      ['b', '1.2', '1880-05-06', '1880-05-06 10:10:10', '2', '2', '23:10:10'],
      ['c', '-1,000.3', '1960-01-01', '1960-01-01 00:00:00', '1', '3', '00:00:00'],
      ['d', '-1.4', '1583-01-01', '1583-01-01 00:00:00', '2', '1', '16:10:10'],
      ['e', '1,000.3', 'NULL', 'NULL', '1', '1', 'NULL'],
    ],
  });
});

test('should import SPSS files (.sav)', async ({
  page,
  storage,
  filePicker,
  addFile,
  assertFileExplorerItems,
  openFileFromExplorer,
  assertDataTableMatches,
}) => {
  const fixturePath = path.resolve(__dirname, '../../fixtures/readstat/sample.sav');

  await storage.uploadFile(fixturePath, 'sample_sav.sav');
  await filePicker.selectFiles(['sample_sav.sav']);
  await addFile();

  await page.waitForSelector(
    '[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]',
    {
      timeout: 10000,
    },
  );
  await assertFileExplorerItems(['sample_sav']);
  await openFileFromExplorer('sample_sav');

  await assertDataTableMatches({
    columnNames: ['name', 'age', 'score'],
    data: [
      ['Alice', '30', '95.5'],
      ['Bob', '25', '87.3'],
      ['Carol', '35', '91'],
    ],
  });
});

test('should import SAS data files (.sas7bdat)', async ({
  page,
  storage,
  filePicker,
  addFile,
  assertFileExplorerItems,
  openFileFromExplorer,
  assertDataTableMatches,
}) => {
  const fixturePath = path.resolve(__dirname, '../../fixtures/readstat/sample.sas7bdat');

  await storage.uploadFile(fixturePath, 'sample_sas7bdat.sas7bdat');
  await filePicker.selectFiles(['sample_sas7bdat.sas7bdat']);
  await addFile();

  await page.waitForSelector(
    '[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]',
    {
      timeout: 10000,
    },
  );
  await assertFileExplorerItems(['sample_sas7bdat']);
  await openFileFromExplorer('sample_sas7bdat');

  await assertDataTableMatches({
    columnNames: ['mychar', 'mynum', 'mydate', 'dtime', 'mylabl', 'myord', 'mytime'],
    data: [
      ['a', '1.1', '2018-05-06', '2018-05-06 10:10:10', '1', '1', '10:10:10'],
      ['b', '1.2', '1880-05-06', '1880-05-06 10:10:10', '2', '2', '23:10:10'],
      ['c', '-1,000.3', '1960-01-01', '1960-01-01 00:00:00', '1', '3', '00:00:00'],
      ['d', '-1.4', '1583-01-01', '1583-01-01 00:00:00', '2', '1', '16:10:10'],
      ['e', '1,000.3', 'NULL', 'NULL', '1', '1', 'NULL'],
    ],
  });
});

test('should import compressed SPSS files (.zsav)', async ({
  page,
  storage,
  filePicker,
  addFile,
  assertFileExplorerItems,
  openFileFromExplorer,
  assertDataTableMatches,
}) => {
  const fixturePath = path.resolve(__dirname, '../../fixtures/readstat/sample.zsav');

  await storage.uploadFile(fixturePath, 'sample_zsav.zsav');
  await filePicker.selectFiles(['sample_zsav.zsav']);
  await addFile();

  await page.waitForSelector(
    '[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]',
    {
      timeout: 10000,
    },
  );
  await assertFileExplorerItems(['sample_zsav']);
  await openFileFromExplorer('sample_zsav');

  await assertDataTableMatches({
    columnNames: ['name', 'age', 'score'],
    data: [
      ['Alice', '30', '95.5'],
      ['Bob', '25', '87.3'],
      ['Carol', '35', '91'],
    ],
  });
});

test('should import SPSS Portable files (.por)', async ({
  page,
  storage,
  filePicker,
  addFile,
  assertFileExplorerItems,
  openFileFromExplorer,
  assertDataTableMatches,
}) => {
  const fixturePath = path.resolve(__dirname, '../../fixtures/readstat/sample.por');

  await storage.uploadFile(fixturePath, 'sample_por.por');
  await filePicker.selectFiles(['sample_por.por']);
  await addFile();

  await page.waitForSelector(
    '[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]',
    {
      timeout: 10000,
    },
  );
  await assertFileExplorerItems(['sample_por']);
  await openFileFromExplorer('sample_por');

  await assertDataTableMatches({
    columnNames: ['NAME', 'AGE', 'SCORE'],
    data: [
      ['Alice', '30', '95.5'],
      ['Bob', '25', '87.3'],
      ['Carol', '35', '91'],
    ],
  });
});

test('should import SAS Transport files (.xpt)', async ({
  page,
  storage,
  filePicker,
  addFile,
  assertFileExplorerItems,
  openFileFromExplorer,
  assertDataTableMatches,
}) => {
  const fixturePath = path.resolve(__dirname, '../../fixtures/readstat/sample.xpt');

  await storage.uploadFile(fixturePath, 'sample_xpt.xpt');
  await filePicker.selectFiles(['sample_xpt.xpt']);
  await addFile();

  await page.waitForSelector(
    '[data-testid^="data-explorer-fs-tree-node-"][data-testid$="-container"]',
    {
      timeout: 10000,
    },
  );
  await assertFileExplorerItems(['sample_xpt']);
  await openFileFromExplorer('sample_xpt');

  await assertDataTableMatches({
    columnNames: ['name', 'age', 'score'],
    data: [
      ['Alice', '30', '95.5'],
      ['Bob', '25', '87.3'],
      ['Carol', '35', '91'],
    ],
  });
});
