import { expect, mergeTests } from '@playwright/test';
import { getTableColumnId } from '@utils/db';

import { COLUMN_NAMES_WITH_SPECIAL_CHARS } from './consts';
import { test as dataViewTest, getDataCellContainer, getHeaderCell } from '../fixtures/data-view';
import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';

const test = mergeTests(baseTest, scriptExplorerTest, scriptEditorTest, dataViewTest);

test('Header cell width matches data cell width for special character columns', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  waitForDataTable,
  assertDataTableMatches,
}) => {
  // Create a new script
  await createScriptAndSwitchToItsTab();

  // Create query with all 42 special character columns
  const queryText = `SELECT ${COLUMN_NAMES_WITH_SPECIAL_CHARS.map(
    (columnName, index) => `${index} as "${columnName.replace(/"/g, '""')}"`,
  ).join(', ')};`;

  await fillScript(queryText);
  // Run the script
  await runScript();

  // Wait for the data table to be visible
  const dataTable = await waitForDataTable();

  // Validate the data table
  await assertDataTableMatches({
    data: [COLUMN_NAMES_WITH_SPECIAL_CHARS.map((_, index) => index.toString())],
    columnNames: COLUMN_NAMES_WITH_SPECIAL_CHARS,
  });

  // For each column name, get corresponding header cell and data container in the first row
  // and check if its width matches the corresponding data cell
  for (let i = 0; i < COLUMN_NAMES_WITH_SPECIAL_CHARS.length; i += 1) {
    const column = COLUMN_NAMES_WITH_SPECIAL_CHARS[i];
    const columnId = getTableColumnId(column, i);
    // Get the current header cell
    const headerCell = getHeaderCell(dataTable, columnId);

    // Get the corresponding data cell in the first row
    const dataCell = getDataCellContainer(dataTable, columnId, 0);
    await expect(dataCell).toBeVisible();

    // Get bounding boxes for both cells
    const headerBoundingBox = await headerCell.boundingBox();
    const dataBoundingBox = await dataCell.boundingBox();

    // Check that the width of the header cell is equal to the width of the data cell
    expect(headerBoundingBox?.width).toBeCloseTo(dataBoundingBox?.width as number, 1);
  }
});

test('Column widths update when the result schema expands in the same tab', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  waitForDataTable,
}) => {
  await createScriptAndSwitchToItsTab();

  await fillScript('SELECT 1 AS initial_column;');
  await runScript();
  await waitForDataTable();

  const columnNames = ['line_id', 'run_id', 'message'];
  await fillScript(`
    SELECT
      21004 + i AS line_id,
      48262306 AS run_id,
      CASE
        WHEN i < 4 THEN 'ok'
        ELSE repeat('A long error message ', 50)
      END AS message
    FROM range(6) AS rows(i);
  `);
  await runScript();

  const dataTable = await waitForDataTable();

  for (let columnIndex = 0; columnIndex < columnNames.length; columnIndex += 1) {
    const columnId = getTableColumnId(columnNames[columnIndex], columnIndex);
    const headerBoundingBox = await getHeaderCell(dataTable, columnId).boundingBox();

    for (const rowIndex of [0, 4]) {
      const dataBoundingBox = await getDataCellContainer(
        dataTable,
        columnId,
        rowIndex,
      ).boundingBox();

      expect(dataBoundingBox?.width).toBeCloseTo(headerBoundingBox?.width as number, 1);
    }
  }
});

test('Column resize persists across schema changes and remounts', async ({
  page,
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  reloadPage,
  waitForDataTable,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(`SELECT 'before' AS message;`);
  await runScript();

  let dataTable = await waitForDataTable();
  const messageColumnId = getTableColumnId('message', 0);
  let messageHeader = getHeaderCell(dataTable, messageColumnId);
  const initialWidth = await messageHeader.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  const resizer = messageHeader.locator('.resizer');
  const resizerBox = await resizer.boundingBox();

  expect(resizerBox).not.toBeNull();
  await page.mouse.move(resizerBox!.x + resizerBox!.width / 2, resizerBox!.y + 10);
  await page.mouse.down();
  await page.mouse.move(resizerBox!.x + 120, resizerBox!.y + 10);
  await page.mouse.up();

  await expect
    .poll(() => messageHeader.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(initialWidth + 100);
  const resizedWidth = await messageHeader.evaluate(
    (element) => element.getBoundingClientRect().width,
  );

  await fillScript(`SELECT 'after' AS message, 2 AS extra;`);
  await runScript();
  dataTable = await waitForDataTable();
  messageHeader = getHeaderCell(dataTable, messageColumnId);

  await expect
    .poll(() => messageHeader.evaluate((element) => element.getBoundingClientRect().width))
    .toBeCloseTo(resizedWidth, 0);
  await expect
    .poll(() =>
      getDataCellContainer(dataTable, messageColumnId, 0).evaluate(
        (element) => element.getBoundingClientRect().width,
      ),
    )
    .toBeCloseTo(resizedWidth, 0);

  await reloadPage();
  dataTable = await waitForDataTable();
  messageHeader = getHeaderCell(dataTable, messageColumnId);

  await expect
    .poll(() => messageHeader.evaluate((element) => element.getBoundingClientRect().width))
    .toBeCloseTo(resizedWidth, 0);

  await messageHeader.locator('.resizer').dblclick();
  await expect
    .poll(() => messageHeader.evaluate((element) => element.getBoundingClientRect().width))
    .toBeCloseTo(200, 0);
});

test('Duplicate column names keep independent persisted widths', async ({
  page,
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  reloadPage,
  waitForDataTable,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(`SELECT 'first' AS column_name, 'second' AS column_name;`);
  await runScript();

  let dataTable = await waitForDataTable();
  const firstColumnId = getTableColumnId('column_name', 0);
  const secondColumnId = getTableColumnId('column_name', 1);
  const firstHeader = getHeaderCell(dataTable, firstColumnId);
  let secondHeader = getHeaderCell(dataTable, secondColumnId);
  const firstWidth = await firstHeader.evaluate((element) => element.getBoundingClientRect().width);
  const secondInitialWidth = await secondHeader.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  const resizerBox = await secondHeader.locator('.resizer').boundingBox();

  expect(resizerBox).not.toBeNull();
  await page.mouse.move(resizerBox!.x + resizerBox!.width / 2, resizerBox!.y + 10);
  await page.mouse.down();
  await page.mouse.move(resizerBox!.x + 120, resizerBox!.y + 10);
  await page.mouse.up();

  await expect
    .poll(() => secondHeader.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(secondInitialWidth + 100);
  const secondResizedWidth = await secondHeader.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  await expect
    .poll(() => firstHeader.evaluate((element) => element.getBoundingClientRect().width))
    .toBeCloseTo(firstWidth, 0);

  await fillScript(`SELECT 'first-new' AS column_name, 'second-new' AS column_name, 3 AS extra;`);
  await runScript();
  dataTable = await waitForDataTable();
  secondHeader = getHeaderCell(dataTable, secondColumnId);
  await expect
    .poll(() => secondHeader.evaluate((element) => element.getBoundingClientRect().width))
    .toBeCloseTo(secondResizedWidth, 0);

  await reloadPage();
  dataTable = await waitForDataTable();
  secondHeader = getHeaderCell(dataTable, secondColumnId);
  await expect
    .poll(() => secondHeader.evaluate((element) => element.getBoundingClientRect().width))
    .toBeCloseTo(secondResizedWidth, 0);

  await secondHeader.locator('.resizer').dblclick();
  await expect
    .poll(() => secondHeader.evaluate((element) => element.getBoundingClientRect().width))
    .toBeCloseTo(200, 0);
});
