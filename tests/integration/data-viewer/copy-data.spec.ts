import { mergeTests, expect } from '@playwright/test';
import { getTableColumnId } from '@utils/db';
import { test as baseTest } from '../fixtures/page';
import { test as tabTest } from '../fixtures/tab';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorer } from '../fixtures/script-explorer';
import { test as dataViewTest, getDataCellContainer, getHeaderCell } from '../fixtures/data-view';
import { test as testTmpTest } from '../fixtures/test-tmp';

const test = mergeTests(
  baseTest,
  tabTest,
  scriptEditorTest,
  dataViewTest,
  testTmpTest,
  scriptExplorer,
);

test('Should copy cell value', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  waitForDataTable,
  page,
  context,
}) => {
  // Grant clipboard permissions
  context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // Create and run script with test data
  await createScriptAndSwitchToItsTab();
  await fillScript(`
  select
    'normal val' as normal_col,
    'comma,val' as 'comma,col',
    'comma quote, "val"' as 'comma quote,"col"'
  `);
  await runScript();

  const expectedData = {
    data: [['normal val', 'comma,val', 'comma quote, "val"']],
    columnNames: ['normal_col', 'comma,col', 'comma quote,"col"'],
  };

  // Get the data table
  const dataTable = await waitForDataTable();

  // Test copying each cell in the row
  for (let colIndex = 0; colIndex < expectedData.columnNames.length; colIndex += 1) {
    const columnName = expectedData.columnNames[colIndex];
    const expectedValue = expectedData.data[0][colIndex];
    const columnId = getTableColumnId(columnName, colIndex);

    // Get the cell container
    const cellContainer = getDataCellContainer(dataTable, columnId, 0);

    // Click the cell to select it
    await cellContainer.click();

    // Use keyboard shortcut to copy (CMD+C)
    await page.keyboard.press('Meta+c');

    // Read the clipboard content
    const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());

    // Verify the clipboard content matches the expected value for this cell
    expect(clipboardContent).toBe(expectedValue);
  }
});

test('Should copy entire row when index column is selected', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  waitForDataTable,
  page,
  context,
}) => {
  // Grant clipboard permissions
  context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // Create and run script with test data
  await createScriptAndSwitchToItsTab();
  await fillScript(`
  select
    'normal val' as normal_col,
    'comma,val' as 'comma,col',
    'comma quote, "val"' as 'comma quote,"col"'
  `);
  await runScript();

  // Get the data table
  const dataTable = await waitForDataTable();

  // Get the index cell container for the row (the cell with "#" header)
  const indexCellContainer = getDataCellContainer(dataTable, '__index__', 0);

  // Click the index cell to select the entire row
  await indexCellContainer.click();

  await page.keyboard.press('Meta+c');

  // Read the clipboard content
  const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());

  expect(clipboardContent).toContain('normal val\t"comma,val"\t"comma quote, ""val"""');
});

test('Should copy one or more rows to clipboard with multi-select', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  waitForDataTable,
  page,
  context,
}) => {
  // Grant clipboard permissions
  context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // Create and run script with test data - 3 rows
  await createScriptAndSwitchToItsTab();
  await fillScript(`
  select 'row1 val1' as col1, 'row1 val2' as col2, 'row1 val3' as col3
  union all
  select 'row2 val1' as col1, 'row2 val2' as col2, 'row2 val3' as col3
  union all
  select 'row3 val1' as col1, 'row3 val2' as col2, 'row3 val3' as col3
  `);
  await runScript();

  // Get the data table
  const dataTable = await waitForDataTable();

  // PART 1: Copy single row (the second row)
  // Get the index cell container for the second row
  const row2IndexCell = getDataCellContainer(dataTable, '__index__', 1);

  // Click the second row's index cell to select just that row
  await row2IndexCell.click();
  await page.keyboard.press('Meta+c');

  // Read and verify the clipboard content for the second row
  let clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardContent).toBe('row2 val1\trow2 val2\trow2 val3');

  // PART 2: Test multi-select with shift key
  // Click the first row's index cell
  const row1IndexCell = getDataCellContainer(dataTable, '__index__', 0);
  await row1IndexCell.click();

  // Hold shift and click the third row's index cell to select rows 1-3
  const row3IndexCell = getDataCellContainer(dataTable, '__index__', 2);
  await page.keyboard.down('Shift');
  await row3IndexCell.click();
  await page.keyboard.up('Shift');

  // Copy the selected rows
  await page.keyboard.press('Meta+c');

  // Read and verify the clipboard content for all three rows
  clipboardContent = await page.evaluate(() => navigator.clipboard.readText());

  // The clipboard should contain all three rows, separated by newlines
  const expectedContent =
    'row1 val1\trow1 val2\trow1 val3\n' +
    'row2 val1\trow2 val2\trow2 val3\n' +
    'row3 val1\trow3 val2\trow3 val3';

  expect(clipboardContent).toBe(expectedContent);

  // PART 3: Test selective multi-select with Meta key
  // First, clear the current selection by clicking elsewhere
  await page.click('body');

  // Click the first row's index cell
  await getDataCellContainer(dataTable, '__index__', 0).click();

  // Hold Meta key and click the third row's index cell to select rows 1 and 3 (but not 2)
  await page.keyboard.down('Meta');
  await getDataCellContainer(dataTable, '__index__', 2).click();
  await page.keyboard.up('Meta');

  // Copy the selected rows
  await page.keyboard.press('Meta+c');

  // Read and verify the clipboard content for rows 1 and 3 (not row 2)
  clipboardContent = await page.evaluate(() => navigator.clipboard.readText());

  // The clipboard should contain rows 1 and 3, separated by newlines, but not row 2
  const expectedSelectiveContent =
    'row1 val1\trow1 val2\trow1 val3\nrow3 val1\trow3 val2\trow3 val3';

  expect(clipboardContent).toBe(expectedSelectiveContent);
});

test('Should copy columns with selection modifiers', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  waitForDataTable,
  page,
  context,
}) => {
  // Grant clipboard permissions
  context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // Create and run script with test data - 3 columns, 2 rows
  await createScriptAndSwitchToItsTab();
  await fillScript(`
  select 'A1' as colA, 'B1' as colB, 'C1' as colC
  union all
  select 'A2' as colA, 'B2' as colB, 'C2' as colC
  `);
  await runScript();

  // Get the data table
  const dataTable = await waitForDataTable();

  // PART 1: Copy single column
  // Get the header cell for the second column (colB)
  const colBHeaderCell = getHeaderCell(dataTable, getTableColumnId('colB', 1));
  await colBHeaderCell.click();
  await page.keyboard.press('Meta+c');

  // Read and verify the clipboard content for the second column
  let clipboardContent = await page.evaluate(() => navigator.clipboard.readText());

  // For column copy, we should get the column header followed by values vertically
  expect(clipboardContent).toBe('colB\nB1\nB2');

  // PART 2: Test multi-select of columns with shift key
  // Click the first column header
  const colAHeaderCell = getHeaderCell(dataTable, getTableColumnId('colA', 0));
  await colAHeaderCell.click();

  // Hold shift and click the third column header to select columns A-C
  const colCHeaderCell = getHeaderCell(dataTable, getTableColumnId('colC', 2));
  await page.keyboard.down('Shift');
  await colCHeaderCell.click();
  await page.keyboard.up('Shift');

  // Copy the selected columns
  await page.keyboard.press('Meta+c');

  // Read and verify the clipboard content for all columns
  clipboardContent = await page.evaluate(() => navigator.clipboard.readText());

  // The clipboard should contain all columns with their data
  // Columns are typically copied with headers in the first row,
  // followed by data rows, with values separated by tabs
  const expectedContentAllColumns = 'colA\tcolB\tcolC\nA1\tB1\tC1\nA2\tB2\tC2';

  expect(clipboardContent).toBe(expectedContentAllColumns);

  // PART 3: Test selective multi-select of columns with Meta key
  // First, clear the current selection by clicking elsewhere
  await page.click('body');

  // Click the first column header
  await colAHeaderCell.click();

  // Hold Meta key and click the third column header to select columns A and C (but not B)
  await page.keyboard.down('Meta');
  await colCHeaderCell.click();
  await page.keyboard.up('Meta');

  // Copy the selected columns
  await page.keyboard.press('Meta+c');

  // Read and verify the clipboard content for columns A and C (not B)
  clipboardContent = await page.evaluate(() => navigator.clipboard.readText());

  // The clipboard should contain columns A and C with their headers, but not B
  const expectedSelectiveColumnsContent = 'colA\tcolC\nA1\tC1\nA2\tC2';

  expect(clipboardContent).toBe(expectedSelectiveColumnsContent);
});
