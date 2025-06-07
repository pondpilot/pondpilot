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
  // Fill the script with the special character columns query.
  // We have to create a table, because of some duckdb-wasm bug that causes `;` to
  // to disappear from column name when running plain select query.
  const queryText = `CREATE OR REPLACE TABLE test_table AS
    SELECT ${COLUMN_NAMES_WITH_SPECIAL_CHARS.map(
      (columnName, index) => `${index} as "${columnName.replace(/"/g, '""')}"`,
    ).join(', ')};
    SELECT * FROM test_table;`;

  await fillScript(queryText);
  // Run the script
  await runScript();

  // Wait for the data table to be visible
  const dataTable = await waitForDataTable();

  // Validate the data table
  await assertDataTableMatches({
    data: [COLUMN_NAMES_WITH_SPECIAL_CHARS.map((_, index) => index)],
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
