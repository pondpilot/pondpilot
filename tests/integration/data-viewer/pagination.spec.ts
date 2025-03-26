import { expect, mergeTests } from '@playwright/test';
import { test as baseTest } from '../fixtures/page';
import { test as tabTest } from '../fixtures/tab';
import { test as queryEditorTest } from '../fixtures/query-editor';
import { test as dataViewTest } from '../fixtures/data-view';

type DataViewerFixtures = {
  /**
   * Creates and runs a query to generate test data with specified number of rows.
   */
  generateTestData: (rowCount: number) => Promise<void>;
};

const test = mergeTests(
  baseTest,
  tabTest,
  queryEditorTest,
  dataViewTest,
).extend<DataViewerFixtures>({
  generateTestData: async (
    { createQueryAndSwitchToItsTab, fillQuery, runQuery, waitForDataTable },
    use,
  ) => {
    await use(async (rowCount: number) => {
      await createQueryAndSwitchToItsTab();

      const query =
        rowCount > 0
          ? `SELECT * FROM UNNEST(GENERATE_SERIES(1, ${rowCount})) AS numbers;`
          : 'SELECT 1 WHERE FALSE;';
      await fillQuery(query);
      await runQuery();

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

    // Check the pagination control is not visible
    await expect(paginationControl).toHaveCount(0);
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
      '1-100 out of 101',
    );

    // Verify that navigation buttons are shown for multi-page
    const navigationButtons = paginationControl.locator('button');
    await expect(navigationButtons).toHaveCount(2);

    // Test navigation - click next page
    await navigationButtons.nth(1).click();

    // Check that pagination text updated correctly for second page
    await expect(paginationControl.getByTestId('pagination-control-out-of')).toHaveText(
      '101-101 out of 101',
    );

    // Click back to previous page
    await navigationButtons.nth(0).click();

    // Check that pagination text returned to initial state
    await expect(paginationControl.getByTestId('pagination-control-out-of')).toHaveText(
      '1-100 out of 101',
    );
  });

  test('should handle empty data set correctly', async ({
    generateTestData,
    paginationControl,
  }) => {
    // Generate an empty dataset
    await generateTestData(0);

    // Check the pagination control is not visible
    await expect(paginationControl).toHaveCount(0);
  });
});
