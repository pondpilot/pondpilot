import { expect, mergeTests } from '@playwright/test';
import { COLUMN_NAMES_WITH_SPECIAL_CHARS } from './consts';
import { test as baseTest } from '../fixtures/page';
import { test as explorerTest } from '../fixtures/explorer';
import { test as tabTest } from '../fixtures/tab';
import { test as spotlightTest } from '../fixtures/spotlight';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as dataViewTest, getDataCellContainer, getHeaderCell } from '../fixtures/data-view';

const test = mergeTests(
  baseTest,
  explorerTest,
  tabTest,
  scriptEditorTest,
  spotlightTest,
  dataViewTest,
);

test('Create and run simple script', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  assertDataTableMatches,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript('select 1');
  await runScript();
  await assertDataTableMatches({ 1: [1] });
});

test('Create and run script with decimals', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  assertDataTableMatches,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(`
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
  await runScript();
  await assertDataTableMatches({ col1: [3], col2: [0.5], col3: [-123.12], col4: [1] });
});

test('Close and reopen script', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  closeActiveTab,
  openScriptFromExplorer,
  scriptEditorContent,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript('select 1');
  await closeActiveTab();
  await openScriptFromExplorer('query.sql');
  await expect(scriptEditorContent).toContainText('select 1');
});

test('Switch between tabs using tabs pane', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  switchToTab,
  getScriptEditorContent,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript('select 1');
  await createScriptAndSwitchToItsTab();
  await expect(await getScriptEditorContent()).toContainText('');
  await switchToTab('query.sql');
  await expect(await getScriptEditorContent()).toContainText('select 1');
});

test('Switch between tabs using script explorer', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  openScriptFromExplorer,
  getScriptEditorContent,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript('select 1');
  await createScriptAndSwitchToItsTab();
  await expect(await getScriptEditorContent()).toContainText('');
  await openScriptFromExplorer('query.sql');
  await expect(await getScriptEditorContent()).toContainText('select 1');
});

test('Create two queries with different content and switch between them', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  switchToTab,
  getScriptEditorContent,
}) => {
  // Create and fill first script
  await createScriptAndSwitchToItsTab();
  await fillScript('select 1 as first_query');

  // Create and fill second script
  await createScriptAndSwitchToItsTab();
  await fillScript('select 2 as second_query');

  // Switch back to first script and verify content
  await switchToTab('query.sql');
  await expect(await getScriptEditorContent()).toContainText('select 1 as first_query');

  // Switch back to second script and verify content
  await switchToTab('query_1.sql');
  await expect(await getScriptEditorContent()).toContainText('select 2 as second_query');
});

test('Create scripts using spotlight menu', async ({
  createScriptViaSpotlight,
  fillScript,
  switchToTab,
  getScriptEditorContent,
}) => {
  // Create first script via spotlight
  await createScriptViaSpotlight();
  await fillScript('select 3 as spotlight_query_1');

  // Create second script via spotlight
  await createScriptViaSpotlight();
  await fillScript('select 4 as spotlight_query_2');

  // Switch to first script and verify content
  await switchToTab('query.sql');
  await expect(await getScriptEditorContent()).toContainText('select 3 as spotlight_query_1');

  // Switch to second script and verify content
  await switchToTab('query_1.sql');
  await expect(await getScriptEditorContent()).toContainText('select 4 as spotlight_query_2');
});

test('Autocomplete converts keywords to uppercase', async ({
  createScriptAndSwitchToItsTab,
  page,
  scriptEditorContent,
}) => {
  await createScriptAndSwitchToItsTab();

  // Type 'select' in the editor
  const editor = scriptEditorContent;
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
