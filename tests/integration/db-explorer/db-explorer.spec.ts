import { execSync } from 'child_process';

import { expect, mergeTests } from '@playwright/test';

import { test as dbExplorerTest } from '../fixtures/db-explorer';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as globalHotkeyTest } from '../fixtures/global-hotkeys';
import { test as baseTest } from '../fixtures/page';
import { isExplorerTreeNodeSelected } from '../fixtures/utils/explorer-tree';
import { FileSystemNode } from '../models';

const test = mergeTests(baseTest, filePickerTest, dbExplorerTest, globalHotkeyTest);

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
    content: 'CREATE OR REPLACE VIEW testview AS SELECT 1 AS value;',
    name: 'testdb',
  },
  {
    type: 'dir',
    name: 'dir-a',
    children: [
      {
        type: 'file',
        ext: 'duckdb',
        content: 'CREATE OR REPLACE VIEW testview AS SELECT 1 AS value;',
        name: 'testdb',
      },
      {
        type: 'dir',
        name: 'dir-b',
        children: [
          {
            type: 'file',
            ext: 'duckdb',
            content: 'CREATE OR REPLACE VIEW testview AS SELECT 1 AS value;',
            name: 'testdb',
          },
        ],
      },
    ],
  },
];

test('Databases: Should create file tree structure and verify persistence after reload', async ({
  filePicker,
  page,
  reloadPage,
  assertDBExplorerItems,
  renameDBInExplorer,
  clickDBNodeMenuItemByName,
  setupFileSystem,
}) => {
  expect(filePicker).toBeDefined();
  await page.getByTestId('navbar-show-databases-button').click();

  // 1. Create files and directories
  await setupFileSystem(FILE_SYSTEM_TREE);

  // 2. Check the DB explorer
  const rootStructure = ['testdb', 'testdb_1 (testdb)', 'testdb_2 (testdb)'];
  await assertDBExplorerItems(rootStructure);

  // 3. Rename files and check persistence after reload
  await renameDBInExplorer({
    oldName: 'testdb',
    newName: 'testdb_renamed',
    expectedNameInExplorer: 'testdb_renamed (testdb)',
  });
  await renameDBInExplorer({
    oldName: 'testdb_1 (testdb)',
    newName: 'testdb_1_renamed',
    expectedNameInExplorer: 'testdb_1_renamed (testdb)',
  });
  await renameDBInExplorer({
    oldName: 'testdb_2 (testdb)',
    newName: 'testdb_2_renamed',
    expectedNameInExplorer: 'testdb_2_renamed (testdb)',
  });

  // Check that the renamed DB appears
  await assertDBExplorerItems([
    'testdb_1_renamed (testdb)',
    'testdb_2_renamed (testdb)',
    'testdb_renamed (testdb)',
  ]);

  await reloadPage();
  // 4. Reload the page and check persistence
  await page.getByTestId('navbar-show-databases-button').click();
  await assertDBExplorerItems([
    'testdb_1_renamed (testdb)',
    'main',
    'testview',
    'testdb_2_renamed (testdb)',
    'main',
    'testview',
    'testdb_renamed (testdb)',
    'main',
    'testview',
  ]);

  await clickDBNodeMenuItemByName('testdb_renamed (testdb)', 'Delete');
  await assertDBExplorerItems([
    'testdb_1_renamed (testdb)',
    'main',
    'testview',
    'testdb_2_renamed (testdb)',
    'main',
    'testview',
  ]);

  await setupFileSystem(FILE_SYSTEM_TREE);

  await assertDBExplorerItems([
    'testdb',
    'testdb_1_renamed (testdb)',
    'main',
    'testview',
    'testdb_2_renamed (testdb)',
    'main',
    'testview',
  ]);
});
