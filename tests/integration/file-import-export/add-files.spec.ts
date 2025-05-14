/* eslint-disable playwright/no-conditional-in-test */
import { execSync } from 'child_process';
import * as fs from 'fs';
import path from 'path';

import { mergeTests, expect } from '@playwright/test';
import { DUCKDB_FORBIDDEN_ATTACHED_DB_NAMES } from '@utils/duckdb/identifier';
import * as XLSX from 'xlsx';

import { FileSystemNode, fileSystemTree } from './models';
import { createFile } from '../../utils';
import { test as dataViewTest } from '../fixtures/data-view';
import { test as dbExplorerTest } from '../fixtures/db-explorer';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as baseTest } from '../fixtures/page';
import { test as scriptEditor } from '../fixtures/script-editor';
import { test as spotlightTest } from '../fixtures/spotlight';
import { test as storageTest } from '../fixtures/storage';
import { test as testTmpTest } from '../fixtures/test-tmp';

const test = mergeTests(
  baseTest,
  storageTest,
  filePickerTest,
  testTmpTest,
  fileSystemExplorerTest,
  dataViewTest,
  spotlightTest,
  scriptEditor,
  dbExplorerTest,
);

test('should add csv files and folders', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  clickFileByName,
  openFileFromExplorer,
  assertDataTableMatches,
  assertFileExplorerItems,
  addDirectoryViaSpotlight,
  reloadPage,
}) => {
  // Test single file
  const test1 = testTmp.join('test1.csv');
  createFile(test1, 'id,name\n1,test1\n2,test2');
  // Prepare test files
  await storage.uploadFile(test1, 'test1.csv');
  // Patch the file picker
  await filePicker.selectFiles(['test1.csv']);
  // Click the add file button
  await addFileButton.click();
  // Verify explorer items
  await assertFileExplorerItems(['test1']);
  // Verify file viewer
  await openFileFromExplorer('test1');
  await assertDataTableMatches({
    data: [
      ['1', 'test1'],
      ['2', 'test2'],
    ],
    columnNames: ['id', 'name'],
  });

  // Test multiple files
  const test2 = testTmp.join('test2.csv');
  createFile(test2, 'col\ntest2');
  const test3 = testTmp.join('test3.csv');
  createFile(test3, 'col\ntest3');
  // Prepare test files
  await storage.uploadFile(test2, 'select_two_files/test2.csv');
  await storage.uploadFile(test3, 'select_two_files/test3.csv');
  // Patch the file picker
  await filePicker.selectFiles(['select_two_files/test2.csv', 'select_two_files/test3.csv']);
  // Click the add file button
  await addFileButton.click();
  // Verify explorer items
  await assertFileExplorerItems(['test1', 'test2', 'test3']);
  // Verify file viewer
  await openFileFromExplorer('test2');
  await assertDataTableMatches({
    data: [['test2']],
    columnNames: ['col'],
  });
  await openFileFromExplorer('test3');
  await assertDataTableMatches({
    data: [['test3']],
    columnNames: ['col'],
  });

  // Test directory
  const testDirFile1 = testTmp.join('dir', 'test_dir_file1.csv');
  createFile(testDirFile1, 'col\ntest_dir_file1');
  const testDirFile2 = testTmp.join('dir', 'test_dir_file2.csv');
  createFile(testDirFile2, 'col\ntest_dir_file2');
  // Upload directory
  await storage.uploadDir(testTmp.join('dir'), 'test_dir');
  // Patch the file picker
  await filePicker.selectDir('test_dir');
  // Click the add folder button
  await addDirectoryViaSpotlight();
  // Verify explorer items
  await assertFileExplorerItems(['test_dir', 'test1', 'test2', 'test3']);
  // Click on the newly added folder to expand it
  await clickFileByName('test_dir');

  // Verify explorer items
  await assertFileExplorerItems([
    'test_dir',
    'test_dir_file1',
    'test_dir_file2',
    'test1',
    'test2',
    'test3',
  ]);

  // Verify file viewer
  await openFileFromExplorer('test_dir_file1');
  await assertDataTableMatches({
    data: [['test_dir_file1']],
    columnNames: ['col'],
  });
  await openFileFromExplorer('test_dir_file2');
  await assertDataTableMatches({
    data: [['test_dir_file2']],
    columnNames: ['col'],
  });

  // Test remove files
  await storage.removeEntry('test1.csv');
  await storage.removeEntry('test_dir');
  // Reload the page
  await reloadPage();
  // Verify explorer items
  await assertFileExplorerItems(['test2', 'test3']);
});

test('should add and read Excel files with multiple sheets', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  openFileFromExplorer,
  assertDataTableMatches,
  assertFileExplorerItems,
  clickFileMenuItemByName,
  clickFileByName,
}) => {
  // Create Excel file with two sheets
  const excelPath = testTmp.join('test.xlsx');

  // Create workbook with two sheets
  const wb = XLSX.utils.book_new();

  // Sheet 1 data
  const sheet1Data = [
    { id: 1, name: 'Alice', department: 'Engineering' },
    { id: 2, name: 'Bob', department: 'Marketing' },
    { id: 3, name: 'Charlie', department: 'Sales' },
  ];
  const sheet1 = XLSX.utils.json_to_sheet(sheet1Data, { skipHeader: true });
  XLSX.utils.book_append_sheet(wb, sheet1, 'Employees');

  // Sheet 2 data
  const sheet2Data = [
    { product: 'Widget', price: 19.99, stock: 42 },
    { product: 'Gadget', price: 24.99, stock: 27 },
    { product: 'Doohickey', price: 14.99, stock: 15 },
  ];
  const sheet2 = XLSX.utils.json_to_sheet(sheet2Data, { skipHeader: true });
  XLSX.utils.book_append_sheet(wb, sheet2, 'Products');

  // Write to file
  XLSX.writeFile(wb, excelPath);

  // Upload the Excel file
  await storage.uploadFile(excelPath, 'test.xlsx');

  // Patch the file picker
  await filePicker.selectFiles(['test.xlsx']);

  // Click the add file button
  await addFileButton.click();

  // Verify excel file itslef is visible
  await assertFileExplorerItems(['test']);

  // Now click on the file to expand it
  await clickFileByName('test');

  // Verify explorer items - should show both sheets as separate files
  await assertFileExplorerItems(['test', 'Employees', 'Products']);

  // Verify first sheet content
  await openFileFromExplorer('Employees');
  await assertDataTableMatches({
    // SheetJS has some issues when saving the header row, it is not
    // recognized as a header by duckdb. So we use skipHeader and default
    // column names that are generated by duckdb.
    data: [
      [1, 'Alice', 'Engineering'],
      [2, 'Bob', 'Marketing'],
      [3, 'Charlie', 'Sales'],
    ],
    columnNames: ['A1', 'B1', 'C1'],
  });

  // Verify second sheet content
  await openFileFromExplorer('Products');
  await assertDataTableMatches({
    // SheetJS has some issues when saving the header row, it is not
    // recognized as a header by duckdb. So we use skipHeader and default
    // column names that are generated by duckdb.
    data: [
      ['Widget', 19.99, 42],
      ['Gadget', 24.99, 27],
      ['Doohickey', 14.99, 15],
    ],
    columnNames: ['A1', 'B1', 'C1'],
  });

  // Delete the database from the DB explorer
  await clickFileMenuItemByName('test', 'Delete');

  // Verify no items left in explorer
  await assertFileExplorerItems([]);
});

test('should handle duckdb files with reserved names correctly', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  assertDBExplorerItems,
  clickDBByName,
  getDBNodeByName,
  assertDataTableMatches,
  openDatabaseExplorer,
  clickDBNodeMenuItemByName,
}) => {
  // Create a DuckDB database with a simple view
  const dbPath = testTmp.join('test.db');
  execSync(`duckdb "${dbPath}" -c "CREATE VIEW test_view AS SELECT 1 AS value;"`);

  // List of names to test - both reserved and non-reserved
  const testNames = DUCKDB_FORBIDDEN_ATTACHED_DB_NAMES.slice();
  // Add one duckdb reserved identifier that is allowed as quoted in attach,
  // and one regular name
  testNames.push('view', 'regular');

  // Open the DB explorer
  await openDatabaseExplorer();

  for (const name of testNames) {
    const testDbPath = testTmp.join(`${name}.duckdb`);

    // Copy the test database to the test name
    fs.copyFileSync(dbPath, testDbPath);

    // Upload the database file
    await storage.uploadFile(testDbPath, `${name}.duckdb`);

    // Patch the file picker
    await filePicker.selectFiles([`${name}.duckdb`]);

    // Click the add file button
    await addFileButton.click();

    // Get the expected resulting database name. For strictly reserved names,
    // we expect them to be renamed with an underscore prefix.
    const expectedDbDisplayName = DUCKDB_FORBIDDEN_ATTACHED_DB_NAMES.includes(name)
      ? `${name}_1 (${name})`
      : name;

    // Non-reserved names should remain as is
    await assertDBExplorerItems([expectedDbDisplayName]);

    // Expand the database by clicking on it
    await clickDBByName(expectedDbDisplayName);

    // Get the main schema node and click it
    const mainSchema = await getDBNodeByName('main');
    await mainSchema.click();

    // Check that the view is present
    const viewNode = await getDBNodeByName('test_view');
    await expect(viewNode).toBeVisible();

    // Open the view by clicking on it
    await viewNode.click();
    // Check that the view is opened and contains the expected data
    await assertDataTableMatches({
      data: [['1']],
      columnNames: ['value'],
    });

    // Delete the database from the DB explorer
    await clickDBNodeMenuItemByName(expectedDbDisplayName, 'Delete');
    // Confirm the deletion
    await assertDBExplorerItems([]);
  }
});

test('should create file tree structure and verify persistence after reload', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  clickFileByName,
  assertFileExplorerItems,
  page,
  addDirectoryViaSpotlight,
  reloadPage,
  renameFileInExplorer,
  assertDBExplorerItems,
  renameDBInExplorer,
}) => {
  await page.goto('/');

  expect(filePicker).toBeDefined();

  // Convert the tree structure into flat lists
  const directories: string[] = [];
  const files: {
    path: string;
    content: string;
    localPath: string;
    name: string;
    ext: 'csv' | 'json' | 'parquet' | 'duckdb' | 'xlsx';
  }[] = [];
  const rootFiles: string[] = [];

  // Function to traverse the tree and form flat lists
  function traverseFileSystem(nodes: FileSystemNode[], currentPath: string = '') {
    for (const node of nodes) {
      if (node.type === 'dir') {
        const dirPath = path.join(currentPath, node.name);
        directories.push(dirPath);

        if (node.children && node.children.length > 0) {
          traverseFileSystem(node.children, dirPath);
        }
      } else if (node.type === 'file') {
        const filePath = path.join(currentPath, `${node.name}.${node.ext}`);
        const localPath = testTmp.join(`
          ${node.name}_${currentPath.replace(/\//g, '_')}.${node.ext}`);

        files.push({
          path: filePath,
          content: node.content,
          localPath,
          name: node.name,
          ext: node.ext,
        });

        // If the file is in the root, add its path for selection via filePicker
        if (currentPath === '') {
          rootFiles.push(filePath);
        }
      }
    }
  }

  // Create flat lists
  traverseFileSystem(fileSystemTree);

  // 1. Create all directories
  for (const dir of directories) {
    await storage.createDir(dir);
  }

  // 2. Create and upload all files
  for (const file of files) {
    if (file.ext === 'parquet') {
      const parquetPath = testTmp.join('exported_view.parquet');

      execSync(
        `duckdb -c "CREATE VIEW export_view AS ${file.content} COPY (SELECT * FROM export_view) TO '${parquetPath}' (FORMAT 'parquet');"`,
      );

      await storage.uploadFile(parquetPath, file.path);
      continue;
    }
    if (file.ext === 'duckdb') {
      const dbPath = testTmp.join(file.path);
      execSync(`duckdb "${dbPath}" -c "${file.content}"`);
      await storage.uploadFile(dbPath, file.path);
      continue;
    }
    if (file.ext === 'json' || file.ext === 'csv') {
      // For CSV and JSON files, we create them locally and upload
      // the local copy to the storage
      const filePath = testTmp.join(file.path);
      createFile(filePath, file.content);
      await storage.uploadFile(filePath, file.path);
      continue;
    }
    if (file.ext === 'xlsx') {
      const filePath = testTmp.join(file.path);
      let json;
      try {
        json = JSON.parse(file.content);
      } catch (e) {
        json = [{ col: file.content }];
      }
      const ws = XLSX.utils.json_to_sheet(json, { skipHeader: true });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, filePath);
      await storage.uploadFile(filePath, file.path);
      continue;
    }
  }

  // 3. Add root files via UI
  await filePicker.selectFiles(rootFiles);
  await addFileButton.click();

  await assertFileExplorerItems(['a', 'a_1 (a)', 'parquet-test', 'xlsx-test']);

  // 4. Determine the root directory to add via UI
  const rootDir = directories.find((dir) => !dir.includes('/'));
  if (rootDir) {
    await filePicker.selectDir(rootDir);
    await addDirectoryViaSpotlight();
  }

  // 5. Check the file tree structure
  // TODO: Create it automatically based on the file system tree
  const rootStructure = ['dir-a', 'a', 'a_1 (a)', 'parquet-test', 'xlsx-test'];
  const firstLevelStructure = [
    'dir-a',
    'dir-b',
    'a_4 (a)',
    'a_5 (a)',
    'a',
    'a_1 (a)',
    'parquet-test',
    'xlsx-test',
  ];
  const secondLevelStructure = [
    'dir-a',
    'dir-b',
    'a_2 (a)',
    'a_3 (a)',
    'a_4 (a)',
    'a_5 (a)',
    'a',
    'a_1 (a)',
    'parquet-test',
    'xlsx-test',
  ];

  const checkFileTreeStructure = async () => {
    // First, check the root level
    await assertFileExplorerItems(rootStructure);
    // Click on the 'dir-a' folder to open its contents
    await clickFileByName('dir-a');
    // Check the contents of the 'dir-a' folder (including files and the 'dir-b' folder)
    await assertFileExplorerItems(firstLevelStructure);
    // Click on the 'dir-b' folder to open its contents
    await clickFileByName('dir-b');
    // Check the contents of the 'dir-b' folder
    await assertFileExplorerItems(secondLevelStructure);
  };
  await checkFileTreeStructure();

  // 6. Reload the page and re-check persistence
  await reloadPage();

  // Repeat checks after reload
  await checkFileTreeStructure();

  // 7. Check the DB explorer
  await page.getByTestId('navbar-show-databases-button').click();
  await assertDBExplorerItems(['testdb', 'main', 'test_view']);

  // 8. Rename files and check persistence
  await reloadPage();

  // Rename files
  await renameFileInExplorer('a', 'a_renamed', 'a');
  await renameFileInExplorer('a_1 (a)', 'a_1_renamed', 'a');
  await renameFileInExplorer('parquet-test', 'parq_renamed', 'parquet-test');
  await renameFileInExplorer('xlsx-test', 'xlsx_renamed', 'xlsx-test');

  // Check the file tree structure after renaming
  const rootWithRenamedFiles = [
    'dir-a',
    'a_renamed (a)',
    'a_1_renamed (a)',
    'parq_renamed (parquet-test)',
    'xlsx_renamed (xlsx-test)',
  ];
  await assertFileExplorerItems(rootWithRenamedFiles);

  // 9. Switch to Databases tab and rename the DuckDB database
  await page.getByTestId('navbar-show-databases-button').click();

  await renameDBInExplorer('testdb', 'testdb_renamed', 'testdb');

  // Check that the renamed DB appears
  await assertDBExplorerItems(['testdb_renamed (testdb)', 'main', 'test_view']);

  // 10. Reload the page and check persistence
  await reloadPage();
  await page.getByTestId('navbar-show-databases-button').click();
  await assertDBExplorerItems(['testdb_renamed (testdb)', 'main', 'test_view']);
});
