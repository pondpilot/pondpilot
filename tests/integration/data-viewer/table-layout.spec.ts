import { expect, mergeTests } from '@playwright/test';
import { getTableColumnId } from '@utils/db';

import { COLUMN_NAMES_WITH_SPECIAL_CHARS } from './consts';
import { test as dataViewTest, getDataCellContainer, getHeaderCell } from '../fixtures/data-view';
import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';

const test = mergeTests(baseTest, scriptExplorerTest, scriptEditorTest, dataViewTest);

const expectColumnWidthsAligned = async (
  dataTable: Parameters<typeof getHeaderCell>[0],
  columnNames: string[],
  rowIndexes: number[],
) => {
  for (let columnIndex = 0; columnIndex < columnNames.length; columnIndex += 1) {
    const columnId = getTableColumnId(columnNames[columnIndex], columnIndex);
    const headerCell = getHeaderCell(dataTable, columnId);

    await expect(headerCell).toBeVisible();
    await expect
      .poll(() => headerCell.evaluate((element) => element.getBoundingClientRect().width))
      .toBeGreaterThan(40);

    for (const rowIndex of rowIndexes) {
      const dataCell = getDataCellContainer(dataTable, columnId, rowIndex);
      await expect
        .poll(async () => {
          const [headerWidth, dataWidth] = await Promise.all([
            headerCell.evaluate((element) => element.getBoundingClientRect().width),
            dataCell.evaluate((element) => element.getBoundingClientRect().width),
          ]);
          return Math.abs(headerWidth - dataWidth);
        })
        .toBeLessThan(0.5);
    }
  }
};

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
  page,
  createScriptAndSwitchToItsTab,
  runScript,
  scriptEditorContent,
  waitForDataTable,
}) => {
  await createScriptAndSwitchToItsTab();

  const replaceScript = async (content: string) => {
    await scriptEditorContent.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText(content);
  };

  await replaceScript('SELECT 1 AS initial_column;');
  await runScript();
  let dataTable = await waitForDataTable();
  await expect(getHeaderCell(dataTable, getTableColumnId('initial_column', 0))).toBeVisible();

  const columnNames = ['line_id', 'run_id', 'message'];
  await replaceScript(`
    SELECT
      21004 + i AS line_id,
      48262306 AS run_id,
      CASE
        WHEN i < 4 THEN 'ok'
        ELSE repeat('A long error message ', 50)
      END AS message
    FROM range(6) AS rows(i)
    ORDER BY i;
  `);
  await runScript();

  dataTable = await waitForDataTable();
  await expectColumnWidthsAligned(dataTable, columnNames, [0, 4]);

  const reorderedColumns = ['message', 'line_id', 'run_id'];
  await replaceScript(`
    SELECT
      CASE WHEN i < 4 THEN 'reordered' ELSE repeat('Long reordered value ', 20) END AS message,
      i AS line_id,
      i * 10 AS run_id
    FROM range(6) AS rows(i)
    ORDER BY i;
  `);
  await runScript();
  dataTable = await waitForDataTable();
  await expect(getHeaderCell(dataTable, getTableColumnId('message', 0))).toBeVisible();
  await expectColumnWidthsAligned(dataTable, reorderedColumns, [0, 4]);

  const replacementColumns = ['alpha', 'beta', 'gamma'];
  await replaceScript(`SELECT i AS alpha, i + 1 AS beta, i + 2 AS gamma FROM range(6) rows(i);`);
  await runScript();
  dataTable = await waitForDataTable();
  await expect(getHeaderCell(dataTable, getTableColumnId('alpha', 0))).toBeVisible();
  await expectColumnWidthsAligned(dataTable, replacementColumns, [0, 4]);

  await replaceScript(`SELECT 7 AS final_column;`);
  await runScript();
  dataTable = await waitForDataTable();
  await expect(getHeaderCell(dataTable, getTableColumnId('final_column', 0))).toBeVisible();
  await expect(dataTable.locator('[data-testid^="data-table-header-cell-container-"]')).toHaveCount(
    2,
  );
  await expectColumnWidthsAligned(dataTable, ['final_column'], [0]);
});

test('Truncation and tooltip state follow column resizing', async ({
  page,
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  waitForDataTable,
}) => {
  const longValue = 'Long value '.repeat(10).trim();
  await createScriptAndSwitchToItsTab();
  await fillScript(`SELECT '${longValue}' AS message;`);
  await runScript();

  const dataTable = await waitForDataTable();
  const columnId = getTableColumnId('message', 0);
  const cell = getDataCellContainer(dataTable, columnId, 0);
  const header = getHeaderCell(dataTable, columnId);
  const resizeBy = async (delta: number) => {
    const resizerBox = await header.locator('.resizer').boundingBox();
    expect(resizerBox).not.toBeNull();
    await page.mouse.move(resizerBox!.x + resizerBox!.width / 2, resizerBox!.y + 10);
    await page.mouse.down();
    await page.mouse.move(resizerBox!.x + delta, resizerBox!.y + 10);
    await page.mouse.up();
  };

  await expect
    .poll(() =>
      cell.evaluate((element) => {
        const value = element.firstElementChild as HTMLElement;
        return value.scrollWidth - value.clientWidth;
      }),
    )
    .toBeGreaterThan(0);
  await expect(cell).toHaveAttribute('data-truncated', 'true');

  await resizeBy(750);
  await expect(cell).not.toHaveAttribute('data-truncated', 'true');
  await page.mouse.move(0, 0);
  await cell.hover();
  await expect(page.getByRole('tooltip')).toBeHidden();

  await resizeBy(-750);
  await expect(cell).toHaveAttribute('data-truncated', 'true');
  await page.mouse.move(0, 0);
  await cell.hover();
  await expect(page.getByRole('tooltip')).toHaveText(longValue);
  await page.mouse.move(0, 0);
  await cell.focus();
  await expect(page.getByRole('tooltip')).toHaveText(longValue);

  await resizeBy(750);
  await expect(cell).not.toHaveAttribute('data-truncated', 'true');
  await expect(page.getByRole('tooltip')).toBeHidden();
});

test('Narrow tables keep headers aligned while scrolling', async ({
  page,
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  waitForDataTable,
}) => {
  await page.setViewportSize({ width: 640, height: 720 });
  await createScriptAndSwitchToItsTab();
  await fillScript(`
    SELECT
      i AS first_column,
      i AS second_column,
      i AS third_column,
      i AS fourth_column,
      i AS fifth_column
    FROM range(200) AS rows(i)
    ORDER BY i;
  `);
  await runScript();

  const dataTable = await waitForDataTable();
  const scrollContainer = dataTable.locator('..');
  const firstHeader = getHeaderCell(dataTable, getTableColumnId('first_column', 0));
  const initialHeaderY = await firstHeader.evaluate((element) => element.getBoundingClientRect().y);

  await expect
    .poll(() => scrollContainer.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeGreaterThan(0);
  await scrollContainer.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() => scrollContainer.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await expect
    .poll(() => scrollContainer.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect
    .poll(() => firstHeader.evaluate((element) => element.getBoundingClientRect().y))
    .toBeCloseTo(initialHeaderY, 0);
  await expect
    .poll(async () => {
      const [headerX, cellX] = await Promise.all([
        firstHeader.evaluate((element) => element.getBoundingClientRect().x),
        getDataCellContainer(dataTable, getTableColumnId('first_column', 0), 99).evaluate(
          (element) => element.getBoundingClientRect().x,
        ),
      ]);
      return Math.abs(headerX - cellX);
    })
    .toBeLessThan(0.5);
  await expectColumnWidthsAligned(
    dataTable,
    ['first_column', 'second_column', 'third_column', 'fourth_column', 'fifth_column'],
    [0, 99],
  );
});
