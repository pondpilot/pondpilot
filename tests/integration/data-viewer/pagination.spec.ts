import { expect, mergeTests } from '@playwright/test';
import { getTableColumnId } from '@utils/db';

import { test as dataViewTest, getHeaderCell } from '../fixtures/data-view';
import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as tabTest } from '../fixtures/tab';

type DataViewerFixtures = {
  /**
   * Creates and runs a query to generate test data with specified number of rows.
   */
  generateTestData: (rowCount: number) => Promise<void>;
};

const test = mergeTests(
  baseTest,
  tabTest,
  scriptEditorTest,
  scriptExplorerTest,
  dataViewTest,
).extend<DataViewerFixtures>({
  generateTestData: async (
    { createScriptAndSwitchToItsTab, fillScript, runScript, waitForDataTable },
    use,
  ) => {
    await use(async (rowCount: number) => {
      await createScriptAndSwitchToItsTab();

      const query =
        rowCount > 0
          ? `SELECT * FROM UNNEST(GENERATE_SERIES(1, ${rowCount})) AS numbers;`
          : 'SELECT 1 WHERE FALSE;';
      await fillScript(query);
      await runScript();

      // FIXME: as of today we do not show the data viewer for empty results...
      if (rowCount === 0) {
        return;
      }

      // Wait for the data table to be visible
      await waitForDataTable();
    });
  },
});

test.describe('Data Viewer Pagination', () => {
  test('should show correct pagination control for small data (single page)', async ({
    generateTestData,
    paginationControl,
  }) => {
    // Generate a small dataset that fits on a single page (assuming 100 per page by default)
    await generateTestData(5);

    // Check the pagination control is visible and has the correct text
    await expect(paginationControl).toHaveText('5 rows');
  });

  test('should show correct pagination control for larger data (multiple pages)', async ({
    generateTestData,
    waitForPaginationControl,
  }) => {
    // Generate a larger dataset that spans multiple pages
    await generateTestData(101);

    // Check the pagination control is visible
    const paginationControl = await waitForPaginationControl();

    // Verify that the pagination control shows the correct text for multi-page data
    await expect(paginationControl.getByTestId('pagination-control-out-of')).toHaveText(
      '1-100 out of 101+ rows',
    );

    // Verify that navigation buttons are shown for multi-page
    const navigationButtons = paginationControl.locator('button');
    await expect(navigationButtons).toHaveCount(2);

    // Test navigation - click next page
    await navigationButtons.nth(1).click();

    // Check that pagination text updated correctly for second page
    await expect(paginationControl.getByTestId('pagination-control-out-of')).toHaveText(
      '2-101 out of 101 rows',
    );

    // Click back to previous page
    await navigationButtons.nth(0).click();

    // Check that pagination text returned to initial state
    await expect(paginationControl.getByTestId('pagination-control-out-of')).toHaveText(
      '1-100 out of 101 rows',
    );
  });

  test('should handle empty data set correctly', async ({
    generateTestData,
    paginationControl,
  }) => {
    // Generate an empty dataset
    await generateTestData(0);

    // Check the pagination control is visible and has the correct text
    await expect(paginationControl).toHaveText('0 rows');
  });

  test('should keep the current page when a column summary pauses the reader', async ({
    page,
    createScriptAndSwitchToItsTab,
    fillScript,
    runScript,
    waitForDataTable,
    waitForPaginationControl,
  }) => {
    // A source much larger than one page keeps the main reader open and
    // non-exhausted while the user is on a later page — the precondition for a
    // transparent reader pause/restore. Selecting a column pauses that reader
    // to run its aggregate, then restores it. The restore must NOT be treated
    // as a logical reload; otherwise the grid jumps back to the first page.
    await createScriptAndSwitchToItsTab();
    await fillScript('SELECT i AS amount FROM range(0, 5000) AS t(i);');
    await runScript();
    const dataTable = await waitForDataTable();

    const paginationControl = await waitForPaginationControl();
    const outOf = paginationControl.getByTestId('pagination-control-out-of');
    await expect(outOf).toContainText('1-100');

    // Move to the second page.
    await paginationControl.locator('button').nth(1).click();
    await expect(outOf).toContainText('101-200');

    // Select the numeric column. A single-column selection triggers a SUM
    // summary, which pauses and then transparently restores the main reader.
    await getHeaderCell(dataTable, getTableColumnId('amount', 0)).click();

    // The footer renders only once the aggregate resolves, which is also when
    // the paused reader has been restored — so this is the moment the page
    // would have been reset by the bug.
    await expect(page.getByText(/SUM:/)).toBeVisible({ timeout: 15000 });

    // The transparent restore must not reset pagination: still on page two.
    await expect(outOf).toContainText('101-200');
  });
});
