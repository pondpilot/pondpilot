import { execSync } from 'child_process';

import { expect, mergeTests } from '@playwright/test';

import { test as dbExplorerTest } from '../fixtures/db-explorer';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as globalHotkeyTest } from '../fixtures/global-hotkeys';
import { test as baseTest } from '../fixtures/page';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as storageTest } from '../fixtures/storage';
import { test as testTmpTest } from '../fixtures/test-tmp';
import { isExplorerTreeNodeSelected } from '../fixtures/utils/explorer-tree';
import { FileSystemNode } from '../models';

const test = mergeTests(
  baseTest,
  fileSystemExplorerTest,
  scriptExplorerTest,
  storageTest,
  filePickerTest,
  testTmpTest,
  dbExplorerTest,
  globalHotkeyTest,
);

test('DuckDB view should be deselected after creating script via spotlight', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  openDatabaseExplorer,
  assertDBExplorerItems,
  clickDBByName,
  pressNewScriptHotkey,
  getDBNodeByName,
}) => {
  // Create a DuckDB database with a test view
  const dbPath = testTmp.join('test_selection.duckdb');
  execSync(`duckdb "${dbPath}" -c "CREATE VIEW test_view AS SELECT 1 AS value;"`);

  // Upload and add the DuckDB file
  await storage.uploadFile(dbPath, 'test_selection.duckdb');
  await filePicker.selectFiles(['test_selection.duckdb']);
  await addFileButton.click();

  // Switch to DB Explorer and expand the database
  await openDatabaseExplorer();
  await assertDBExplorerItems(['test_selection']);
  await clickDBByName('test_selection');

  // Get the main schema node and click it to expand
  const mainSchema = await getDBNodeByName('main');
  await mainSchema.click();

  // Check that the view is present
  const viewNode = await getDBNodeByName('test_view');
  await expect(viewNode).toBeVisible();

  // Click the view to select it
  await viewNode.click();

  // Check that the view is selected
  expect(await isExplorerTreeNodeSelected(viewNode)).toBe(true);

  // Create a new script using spotlight without mouse interactions
  // and verify file gets deselected
  await pressNewScriptHotkey();

  // Check that the view is deselected after creating the script
  expect(await isExplorerTreeNodeSelected(viewNode)).toBe(false);
});

export const FILE_SYSTEM_TREE: FileSystemNode[] = [
  {
    type: 'file',
    ext: 'duckdb',
    content: 'CREATE VIEW test_view AS SELECT 123 AS value;',
    name: 'testdb',
  },
];

test('Should create file tree structure and verify persistence after reload', async ({
  filePicker,
  clickFileByName,
  assertFileExplorerItems,
  page,
  reloadPage,
  renameFileInExplorer,
  assertDBExplorerItems,
  renameDBInExplorer,
  setupFileSystem,
}) => {
  await page.goto('/');

  expect(filePicker).toBeDefined();

  // Create files and directories
  await setupFileSystem(FILE_SYSTEM_TREE);

  // 5. Check the file tree structure
  const rootStructure = ['dir-a', 'a', 'a_1 (a)', 'parquet-test', 'xlsx-test'];

  await assertFileExplorerItems(rootStructure);

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
  await renameFileInExplorer({
    oldName: 'a',
    newName: 'a_renamed',
    expectedNameInExplorer: 'a_renamed (a)',
  });
  await renameFileInExplorer({
    oldName: 'a_1 (a)',
    newName: 'a_1_renamed',
    expectedNameInExplorer: 'a_1_renamed (a)',
  });
  await renameFileInExplorer({
    oldName: 'parquet-test',
    newName: 'parquet_renamed',
    expectedNameInExplorer: 'parquet_renamed (parquet-test)',
  });
  await renameFileInExplorer({
    oldName: 'xlsx-test',
    newName: 'xlsx_renamed',
    expectedNameInExplorer: 'xlsx_renamed (xlsx-test)',
  });

  // Check the file tree structure after renaming
  const rootWithRenamedFiles = [
    'dir-a',
    'a_renamed (a)',
    'a_1_renamed (a)',
    'parquet_renamed (parquet-test)',
    'xlsx_renamed (xlsx-test)',
  ];
  await assertFileExplorerItems(rootWithRenamedFiles);

  // 9. Switch to Databases tab and rename the DuckDB database
  await page.getByTestId('navbar-show-databases-button').click();

  await renameDBInExplorer({
    oldName: 'testdb',
    newName: 'testdb_renamed',
    expectedNameInExplorer: 'testdb_renamed (testdb)',
  });

  // Check that the renamed DB appears
  await assertDBExplorerItems(['testdb_renamed (testdb)', 'main', 'test_view']);

  // 10. Reload the page and check persistence
  await reloadPage();
  await page.getByTestId('navbar-show-databases-button').click();
  await assertDBExplorerItems(['testdb_renamed (testdb)', 'main', 'test_view']);
});
