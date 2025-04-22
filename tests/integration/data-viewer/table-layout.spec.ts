import { expect, mergeTests } from '@playwright/test';
import { replaceSpecialChars } from '@utils/helpers';
import { test as baseTest } from '../fixtures/page';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as dataViewTest, getDataCellContainer, getHeaderCell } from '../fixtures/data-view';
import { COLUMN_NAMES_WITH_SPECIAL_CHARS } from './consts';

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
    ...COLUMN_NAMES_WITH_SPECIAL_CHARS.reduce(
      (acc, columnName, index) => ({
        ...acc,
        [columnName]: [index],
      }),
      {},
    ),
  });

  // For each column name, get corresponding header cell and data container in the first row
  // and check if its width matches the corresponding data cell
  for (const column of COLUMN_NAMES_WITH_SPECIAL_CHARS) {
    const columnName = replaceSpecialChars(column);
    // Get the current header cell
    const headerCell = getHeaderCell(dataTable, columnName);

    // Get the corresponding data cell in the first row
    const dataCell = getDataCellContainer(dataTable, columnName, 0);
    await expect(dataCell).toBeVisible();

    // Get bounding boxes for both cells
    const headerBoundingBox = await headerCell.boundingBox();
    const dataBoundingBox = await dataCell.boundingBox();

    // Check that the width of the header cell is equal to the width of the data cell
    expect(headerBoundingBox?.width).toBeCloseTo(dataBoundingBox?.width as number, 1);
  }
});
