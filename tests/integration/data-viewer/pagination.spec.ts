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

  /**
   * Creates and runs a query to generate an empty test result set.
   */
  generateEmptyTestData: () => Promise<void>;
};

const test = mergeTests(
  baseTest,
  tabTest,
  queryEditorTest,
  dataViewTest,
).extend<DataViewerFixtures>({
  generateTestData: async ({ createQueryAndSwitchToItsTab, fillQuery, runQuery }, use) => {
    await use(async (rowCount: number) => {
      await createQueryAndSwitchToItsTab();

      const query =
        rowCount > 0
          ? `SELECT * FROM UNNEST(GENERATE_SERIES(1, ${rowCount})) AS numbers;`
          : 'SELECT 1 WHERE FALSE;';
      await fillQuery(query);
      await runQuery();
    });
  },
});

test.describe('Data Viewer Pagination', () => {
  test('should show correct pagination control for small data (single page)', async ({
    generateTestData,
    waitForPaginationControl,
  }) => {
    // Generate a small dataset that fits on a single page (assuming 25 per page by default)
    await generateTestData(5);

    // Check the pagination control is visible
    const paginationControl = await waitForPaginationControl();

    // Verify that the pagination control shows the correct text for small data
    // Format should be "5 out of 5" for single page
    const paginationText = await paginationControl.locator('.text-sm').textContent();
    expect(paginationText?.trim()).toBe('5 out of 5');

    // Verify that navigation buttons are not shown for single page
    const navigationButtons = paginationControl.locator('button');
    await expect(navigationButtons).toHaveCount(0);

    // Verify the pagination control is centered for single page
    const justifyCenter = await paginationControl.evaluate((el) => {
      const firstDiv = el.querySelector('div');
      if (!firstDiv) return false;
      return window.getComputedStyle(firstDiv).justifyContent === 'center';
    });
    expect(justifyCenter).toBe(true);
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
    // Format should be "1-25 out of 30" for multi-page (assuming 25 per page)
    const paginationText = await paginationControl.locator('.text-sm').textContent();
    expect(paginationText?.trim()).toBe('1-25 out of 30');

    // Verify that navigation buttons are shown for multi-page
    const navigationButtons = paginationControl.locator('button');
    await expect(navigationButtons).toHaveCount(2);

    // Verify the pagination control has space-between layout for multi-page
    const justifySpaceBetween = await paginationControl.evaluate((el) => {
      const firstDiv = el.querySelector('div');
      if (!firstDiv) return false;
      return window.getComputedStyle(firstDiv).justifyContent === 'space-between';
    });
    expect(justifySpaceBetween).toBe(true);

    // Test navigation - click next page
    await navigationButtons.nth(1).click();

    // Check that pagination text updated correctly for second page
    const updatedPaginationText = await paginationControl.locator('.text-sm').textContent();
    expect(updatedPaginationText?.trim()).toBe('26-30 out of 30');

    // Click back to previous page
    await navigationButtons.nth(0).click();

    // Check that pagination text returned to initial state
    const returnedPaginationText = await paginationControl.locator('.text-sm').textContent();
    expect(returnedPaginationText?.trim()).toBe('1-25 out of 30');
  });

  test('should handle empty data set correctly', async ({
    generateTestData,
    waitForPaginationControl,
  }) => {
    // Generate an empty dataset
    await generateTestData(0);

    // Check if "No data" message is shown in the pagination control or data viewer
    const paginationControl = await waitForPaginationControl();

    const paginationText = await paginationControl.locator('.text-sm').textContent();
    expect(paginationText?.trim()).toBe('No data');
  });
});
