import { mergeTests, expect } from '@playwright/test';
import { getTableColumnId } from '@utils/db';
import { formatTableData } from '@utils/table';
import { MAX_PERSISTED_STALE_DATA_ROWS } from '@models/tab';
import { test as baseTest } from '../fixtures/page';
import { test as tabTest } from '../fixtures/tab';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorer } from '../fixtures/script-explorer';
import { test as dataViewTest, getDataCellContainer, getHeaderCell } from '../fixtures/data-view';
import { test as testTmpTest } from '../fixtures/test-tmp';
import { getClipboardContent } from '../../utils';

const test = mergeTests(
  baseTest,
  tabTest,
  scriptEditorTest,
  dataViewTest,
  testTmpTest,
  scriptExplorer,
);

// Common test dataset to use in all tests
const TEST_DATA_SQL = `
      select 'row1 val1' as col1, 'row1 val2' as col2, 'row1 val3' as col3
      union all
      select 'row2 val1' as col1, 'row2 val2' as col2, 'row2 val3' as col3
      union all
      select 'row3 val1' as col1, 'row3 val2' as col2, 'row3 val3' as col3
      union all
      select null as col1, null as col2, null as col3
      `;

test('Should copy cell value', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  waitForDataTable,
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // Create and run script with test data
  await createScriptAndSwitchToItsTab();
  await fillScript(TEST_DATA_SQL);
  await runScript();

  const expectedData = {
    data: [['row1 val1', 'row1 val2', 'row1 val3']],
    columnNames: ['col1', 'col2', 'col3'],
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

    await page.keyboard.press('ControlOrMeta+c', { delay: 100 });

    // Read the clipboard content
    const clipboardContent = await getClipboardContent(page);

    // Verify the clipboard content matches the expected value for this cell
    expect(clipboardContent).toBe(expectedValue);
  }

  // Test copying null values (should be empty strings)
  for (let colIndex = 0; colIndex < expectedData.columnNames.length; colIndex += 1) {
    const columnName = expectedData.columnNames[colIndex];
    const columnId = getTableColumnId(columnName, colIndex);

    // Get the cell container for the null row (index 3)
    const cellContainer = getDataCellContainer(dataTable, columnId, 3);

    // Click the cell to select it
    await cellContainer.click();

    await page.keyboard.press('ControlOrMeta+c', { delay: 100 });

    // Read the clipboard content
    const clipboardContent = await getClipboardContent(page);

    // Verify null values are copied as NULL for single cell
    expect(clipboardContent).toBe('NULL');
  }
});

test('Should copy rows with selection modifiers', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  waitForDataTable,
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // Create and run a single script with all test data
  await createScriptAndSwitchToItsTab();
  await fillScript(TEST_DATA_SQL);
  await runScript();

  // Get the data table once for all test parts
  const dataTable = await waitForDataTable();

  // PART 1: Copy single row (the first row)
  const row1IndexCell = getDataCellContainer(dataTable, '__index__', 0);
  await row1IndexCell.click();
  await page.keyboard.press('ControlOrMeta+c', { delay: 100 });

  // Read and verify the clipboard content for the first row
  let clipboardContent = await getClipboardContent(page);
  expect(clipboardContent).toBe('row1 val1\trow1 val2\trow1 val3');

  // PART 2: Test multi-select with shift key
  // First, clear the current selection by clicking elsewhere
  await page.keyboard.press('Escape');

  // Click the first row's index cell
  await row1IndexCell.click();

  // Hold shift and click the third row's index cell to select rows 1-3
  const row3IndexCell = getDataCellContainer(dataTable, '__index__', 2);
  await page.keyboard.down('Shift');
  await row3IndexCell.click();
  await page.keyboard.up('Shift');

  // Copy the selected rows
  await page.keyboard.press('ControlOrMeta+c', { delay: 100 });

  // Read and verify the clipboard content for all three rows
  clipboardContent = await getClipboardContent(page);

  // The clipboard should contain all three rows, separated by newlines
  const formattedData = formatTableData(
    [
      ['row1 val1', 'row1 val2', 'row1 val3'],
      ['row2 val1', 'row2 val2', 'row2 val3'],
      ['row3 val1', 'row3 val2', 'row3 val3'],
    ],
    '\t',
  );

  expect(clipboardContent).toBe(formattedData);

  // PART 3: Test selective multi-select with Meta key
  await page.keyboard.press('Escape');

  // Click the first row's index cell
  await row1IndexCell.click();

  // Hold Meta key and click the third row's index cell to select rows 1 and 3 (but not 2)
  await page.keyboard.down('Meta');
  await row3IndexCell.click();
  await page.keyboard.up('Meta');

  // Copy the selected rows
  await page.keyboard.press('ControlOrMeta+c', { delay: 100 });

  // Read and verify the clipboard content for rows 1 and 3 (not row 2)
  clipboardContent = await getClipboardContent(page);

  // The clipboard should contain rows 1 and 3, separated by newlines, but not row 2
  const expectedSelectiveContent =
    'row1 val1\trow1 val2\trow1 val3\nrow3 val1\trow3 val2\trow3 val3';

  expect(clipboardContent).toBe(expectedSelectiveContent);

  // PART 4: Test copying null values row
  await page.keyboard.press('Escape');

  // Click the null values row index cell
  const nullRowIndexCell = getDataCellContainer(dataTable, '__index__', 3);
  await nullRowIndexCell.click();

  // Copy the selected row
  await page.keyboard.press('ControlOrMeta+c', { delay: 100 });

  // Read and verify the clipboard content for the null values row
  clipboardContent = await getClipboardContent(page);

  // The clipboard should contain empty strings for null values
  expect(clipboardContent).toBe('\t\t');
});

test('Should copy columns with selection modifiers', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  waitForDataTable,
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // Create and run script with test data - 3 columns, 3 rows
  await createScriptAndSwitchToItsTab();
  await fillScript(TEST_DATA_SQL);
  await runScript();

  // Get the data table
  const dataTable = await waitForDataTable();

  // PART 1: Copy single column
  // Get the header cell for the second column (col2)
  const col2HeaderCell = getHeaderCell(dataTable, getTableColumnId('col2', 1));
  await col2HeaderCell.click();
  await page.keyboard.press('ControlOrMeta+c', { delay: 100 });

  // Read and verify the clipboard content for the second column
  let clipboardContent = await getClipboardContent(page);

  // For column copy, we should get the column header followed by values vertically
  expect(clipboardContent).toBe('col2\nrow1 val2\nrow2 val2\nrow3 val2\n');

  // PART 2: Test multi-select of columns with shift key
  // Click the first column header
  const col1HeaderCell = getHeaderCell(dataTable, getTableColumnId('col1', 0));
  await col1HeaderCell.click();

  // Hold shift and click the third column header to select columns 1-3
  const col3HeaderCell = getHeaderCell(dataTable, getTableColumnId('col3', 2));
  await page.keyboard.down('Shift');
  await col3HeaderCell.click();
  await page.keyboard.up('Shift');

  // Copy the selected columns
  await page.keyboard.press('ControlOrMeta+c', { delay: 100 });

  // Read and verify the clipboard content for all columns
  clipboardContent = await getClipboardContent(page);

  // The clipboard should contain all columns with their data
  // Columns are typically copied with headers in the first row,
  // followed by data rows, with values separated by tabs
  const expectedContentAllColumns = formatTableData(
    [
      ['col1', 'col2', 'col3'],
      ['row1 val1', 'row1 val2', 'row1 val3'],
      ['row2 val1', 'row2 val2', 'row2 val3'],
      ['row3 val1', 'row3 val2', 'row3 val3'],
      ['', '', ''], // Null row values should be empty strings
    ],
    '\t',
  );

  expect(clipboardContent).toBe(expectedContentAllColumns);

  // PART 3: Test selective multi-select of columns with Meta key
  await page.keyboard.press('Escape');

  // Click the first column header
  await col1HeaderCell.click();

  // Hold Meta key and click the third column header to select columns 1 and 3 (but not 2)
  await page.keyboard.down('Meta');
  await col3HeaderCell.click();
  await page.keyboard.up('Meta');

  // Copy the selected columns
  await page.keyboard.press('ControlOrMeta+c', { delay: 100 });

  // Read and verify the clipboard content for columns 1 and 3 (not 2)
  clipboardContent = await getClipboardContent(page);

  // The clipboard should contain columns 1 and 3 with their headers, but not 2
  const expectedSelectiveColumnsContent = formatTableData(
    [
      ['col1', 'col3'],
      ['row1 val1', 'row1 val3'],
      ['row2 val1', 'row2 val3'],
      ['row3 val1', 'row3 val3'],
      ['', ''], // Null row values should be empty strings
    ],
    '\t',
  );

  expect(clipboardContent).toBe(expectedSelectiveColumnsContent);
});

test('Should copy column selection from large table', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  waitForDataTable,
  page,
  context,
  assertDataTableMatches,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // Create and run script with test data - 3 column > 2048 rows
  await createScriptAndSwitchToItsTab();
  await fillScript(`
      select
        'row' || i as col1,
        'row' || i || ' val2' as col2,
        'row' || i || ' val3' as col3
      from (
        select i
        from range(0, ${MAX_PERSISTED_STALE_DATA_ROWS + 10}) as t(i)
      )
    `);
  await runScript();

  // Get the data table
  const dataTable = await waitForDataTable();

  // Check that only the first 100 rows are displayed
  await assertDataTableMatches({
    data: Array.from({ length: 100 }, (_, i) => [`row${i}`, `row${i} val2`, `row${i} val3`]),
    columnNames: ['col1', 'col2', 'col3'],
  });

  // Copy middle column
  // Get the header cell for the second column (col2)
  const col2HeaderCell = getHeaderCell(dataTable, getTableColumnId('col2', 1));
  await col2HeaderCell.click();
  await page.keyboard.press('ControlOrMeta+c', { delay: 100 });

  // Read and verify the clipboard content for the second column
  const clipboardContent = await getClipboardContent(page);

  // The clipboard should contain all column data
  const expectedContentAllColumns = formatTableData(
    [
      ['col2'],
      ...Array.from({ length: MAX_PERSISTED_STALE_DATA_ROWS + 10 }, (_, i) => [`row${i} val2`]),
    ],
    '\t',
  );

  expect(clipboardContent).toBe(expectedContentAllColumns);
});

test('Should copy entire table when using copy table button', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  waitForDataTable,
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // Create and run script with test data
  await createScriptAndSwitchToItsTab();
  await fillScript(TEST_DATA_SQL);
  await runScript();

  // Wait for the data table to load
  await waitForDataTable();

  // Find and click the copy table button
  const copyTableButton = page.getByTestId('copy-table-button');
  await copyTableButton.click();

  // Get the clipboard content
  const clipboardContent = await getClipboardContent(page);

  // The clipboard should contain the entire table with headers and all data
  const expectedTableContent = formatTableData(
    [
      ['col1', 'col2', 'col3'],
      ['row1 val1', 'row1 val2', 'row1 val3'],
      ['row2 val1', 'row2 val2', 'row2 val3'],
      ['row3 val1', 'row3 val2', 'row3 val3'],
      ['', '', ''], // Null row values should be empty strings
    ],
    '\t',
  );

  expect(clipboardContent).toBe(expectedTableContent);
});
