import { expect, mergeTests } from '@playwright/test';
import { COLUMN_NAMES_WITH_SPECIAL_CHARS } from './consts';
import { test as dataViewTest, getDataCellContainer, getHeaderCell } from '../fixtures/data-view';
import { test as explorerTest } from '../fixtures/explorer';
import { test as baseTest } from '../fixtures/page';
import { test as queryEditorTest } from '../fixtures/query-editor';
import { test as spotlightTest } from '../fixtures/spotlight';
import { test as tabTest } from '../fixtures/tab';

const test = mergeTests(
  baseTest,
  explorerTest,
  tabTest,
  queryEditorTest,
  spotlightTest,
  dataViewTest,
);

test('Create and run simple query', async ({
  createQueryAndSwitchToItsTab,
  fillQuery,
  runQuery,
  assertDataTableMatches,
}) => {
  await createQueryAndSwitchToItsTab();
  await fillQuery('select 1');
  await runQuery();
  await assertDataTableMatches({ 1: [1] });
});

test('Create and run query with decimals', async ({
  createQueryAndSwitchToItsTab,
  fillQuery,
  runQuery,
  assertDataTableMatches,
}) => {
  await createQueryAndSwitchToItsTab();
  await fillQuery(`
    select
      sum(col1) as col1,
      0.5 as col2,
      (-123.123)::DECIMAL(10,2) as col3,
      1::INT128 as col4
    from (
      select 1 as col1
      union select 2 as col1
    )
  `);
  await runQuery();
  await assertDataTableMatches({ col1: [3], col2: [0.5], col3: [-123.12], col4: [1] });
});

test('Close and reopen query', async ({
  createQueryAndSwitchToItsTab,
  fillQuery,
  closeActiveTab,
  openQueryFromExplorer,
  queryEditorContent,
}) => {
  await createQueryAndSwitchToItsTab();
  await fillQuery('select 1');
  await closeActiveTab();
  await openQueryFromExplorer('query.sql');
  await expect(queryEditorContent).toContainText('select 1');
});

test('Switch between tabs using tabs pane', async ({
  createQueryAndSwitchToItsTab,
  fillQuery,
  switchToTab,
  queryEditorContent,
}) => {
  await createQueryAndSwitchToItsTab();
  await fillQuery('select 1');
  await createQueryAndSwitchToItsTab();
  await expect(queryEditorContent).toContainText('');
  await switchToTab('query.sql');
  await expect(queryEditorContent).toContainText('select 1');
});

test('Switch between tabs using query explorer', async ({
  createQueryAndSwitchToItsTab,
  fillQuery,
  openQueryFromExplorer,
  queryEditorContent,
}) => {
  await createQueryAndSwitchToItsTab();
  await fillQuery('select 1');
  await createQueryAndSwitchToItsTab();
  await expect(queryEditorContent).toContainText('');
  await openQueryFromExplorer('query.sql');
  await expect(queryEditorContent).toContainText('select 1');
});

test('Create two queries with different content and switch between them', async ({
  createQueryAndSwitchToItsTab,
  fillQuery,
  switchToTab,
  queryEditorContent,
}) => {
  // Create and fill first query
  await createQueryAndSwitchToItsTab();
  await fillQuery('select 1 as first_query');

  // Create and fill second query
  await createQueryAndSwitchToItsTab();
  await fillQuery('select 2 as second_query');

  // Switch back to first query and verify content
  await switchToTab('query.sql');
  await expect(queryEditorContent).toContainText('select 1 as first_query');

  // Switch back to second query and verify content
  await switchToTab('query_1.sql');
  await expect(queryEditorContent).toContainText('select 2 as second_query');
});

test('Create queries using spotlight menu', async ({
  createQueryViaSpotlight,
  fillQuery,
  switchToTab,
  queryEditorContent,
}) => {
  // Create first query via spotlight
  await createQueryViaSpotlight();
  await fillQuery('select 3 as spotlight_query_1');

  // Create second query via spotlight
  await createQueryViaSpotlight();
  await fillQuery('select 4 as spotlight_query_2');

  // Switch to first query and verify content
  await switchToTab('query.sql');
  await expect(queryEditorContent).toContainText('select 3 as spotlight_query_1');

  // Switch to second query and verify content
  await switchToTab('query_1.sql');
  await expect(queryEditorContent).toContainText('select 4 as spotlight_query_2');
});

test('Autocomplete converts keywords to uppercase', async ({
  createQueryAndSwitchToItsTab,
  page,
  queryEditorContent,
}) => {
  await createQueryAndSwitchToItsTab();

  // Type 'select' in the editor
  const editor = queryEditorContent;
  await editor.pressSequentially('select');

  // Wait for autocomplete to appear and check it's visible
  const autocompleteTooltip = page.locator('.cm-tooltip-autocomplete');
  await expect(autocompleteTooltip).toBeVisible();

  // Use a more specific selector that matches only the exact "SELECT" option
  const selectOption = autocompleteTooltip.getByRole('option', { name: 'SELECT', exact: true });
  await expect(selectOption).toBeVisible();

  // Click on the exact SELECT option
  await selectOption.click();

  // Verify that 'select' has been converted to uppercase 'SELECT'
  await expect(editor).toContainText('SELECT');
});

test('Header cell width matches data cell width for special character columns', async ({
  createQueryAndSwitchToItsTab,
  fillQuery,
  runQuery,
  waitForDataTable,
  assertDataTableMatches,
}) => {
  // Create a new query
  await createQueryAndSwitchToItsTab();
  // Fill the query with the special character columns query.
  // We have to create a table, because of some duckdb-wasm bug that causes `;` to
  // to disappear from column name when running plain select query.
  const queryText = `CREATE OR REPLACE TABLE test_table AS
    SELECT ${COLUMN_NAMES_WITH_SPECIAL_CHARS.map(
      (columnName, index) => `${index} as "${columnName.replace(/"/g, '""')}"`,
    ).join(', ')};
    SELECT * FROM test_table;`;

  await fillQuery(queryText);
  // Run the query
  await runQuery();

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
  for (const columnName of COLUMN_NAMES_WITH_SPECIAL_CHARS) {
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
