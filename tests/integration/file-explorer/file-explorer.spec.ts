import { expect, mergeTests } from '@playwright/test';

import { createFile } from '../../utils';
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
  scriptExplorerTest,
  storageTest,
  filePickerTest,
  testTmpTest,
  fileSystemExplorerTest,
  globalHotkeyTest,
);

test('File should be deselected after creating script from it', async ({
  addFileButton,
  storage,
  filePicker,
  testTmp,
  createScriptFromFileExplorer,
  assertFileExplorerItems,
  clickFileByName,
  getFileNodeByName,
  assertScriptExplorerItems,
  pressNewScriptHotkey,
}) => {
  // Create and add a test file
  const testFile = testTmp.join('test_selection.csv');
  const testFileContent = 'col\ntest_value';
  createFile(testFile, testFileContent);
  await storage.uploadFile(testFile, 'test_selection.csv');
  await filePicker.selectFiles(['test_selection.csv']);
  await addFileButton.click();

  // Verify the file was added
  await assertFileExplorerItems(['test_selection']);

  // Check that the file is selected (has data-selected="true")
  const fileNode = await getFileNodeByName('test_selection');
  // Select the file node
  await fileNode.click();
  // Check that the file is selected
  expect(await isExplorerTreeNodeSelected(fileNode)).toBe(true);

  // Create a script from the file
  await createScriptFromFileExplorer('test_selection');
  // Check that the file is now deselected
  expect(await isExplorerTreeNodeSelected(fileNode)).toBe(false);

  // Select the file again
  await clickFileByName('test_selection');
  expect(await isExplorerTreeNodeSelected(fileNode)).toBe(true);

  // Create a new script using spotlight without mouse interactions
  // and verify file gets deselected
  await pressNewScriptHotkey();

  // Check that we now have 2 scripts
  await assertScriptExplorerItems(['query.sql', 'test_selection_query.sql']);

  // Check that the file selection is cleared after creating script via hotkey
  expect(await isExplorerTreeNodeSelected(fileNode)).toBe(false);
});

export const FILE_SYSTEM_TREE: FileSystemNode[] = [
  {
    type: 'file',
    ext: 'csv',
    content: 'col\ndata1',
    name: 'a',
  },
  {
    type: 'file',
    ext: 'json',
    content: '{"col": "data2"}',
    name: 'a',
  },
  {
    type: 'file',
    ext: 'xlsx',
    content: '[{"col": "dataXLSX1"}]',
    name: 'xlsx-test',
  },
  {
    type: 'file',
    ext: 'parquet',
    content: "SELECT 'data3' AS col;",
    name: 'parquet-test',
  },
  {
    type: 'dir',
    name: 'dir-a',
    children: [
      {
        type: 'file',
        ext: 'csv',
        content: 'col\ndataA1',
        name: 'a',
      },
      {
        type: 'file',
        ext: 'json',
        content: '{"col": "dataA2"}',
        name: 'a',
      },

      {
        type: 'dir',
        name: 'dir-b',
        children: [
          {
            type: 'file',
            ext: 'csv',
            content: 'col\ndataB1',
            name: 'a',
          },
          {
            type: 'file',
            ext: 'json',
            content: '{"col": "dataB2"}',
            name: 'a',
          },
        ],
      },
    ],
  },
];

test('Should create file tree structure and verify persistence after reload', async ({
  filePicker,
  clickFileByName,
  assertFileExplorerItems,
  page,
  reloadPage,
  renameFileInExplorer,
  setupFileSystem,
}) => {
  await page.goto('/');

  expect(filePicker).toBeDefined();

  // Create files and directories
  await setupFileSystem(FILE_SYSTEM_TREE);

  // 5. Check the file tree structure
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

  // 7. Rename files and check persistence
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

  // 6. Reload the page and re-check persistence
  await reloadPage();

  // Repeat checks after reload
  await assertFileExplorerItems(rootWithRenamedFiles);
});
