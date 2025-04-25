import { MAX_DATA_VIEW_PAGE_SIZE } from '@models/tab';
import { test as base, expect, Locator } from '@playwright/test';
import { replaceSpecialChars } from '@utils/helpers';

type ExpectedDataValue = number | string;

/**
 * Expected data structure for the data table.
 *
 * Must have at least one column and all columns must have the same number of rows.
 */
type ExpectedData = Record<string, ExpectedDataValue[]>;

type DataViewFixtures = {
  /**
   * Data table locator
   */
  dataTable: Locator;

  /**
   * Wait for data table to be visible and return it.
   */
  waitForDataTable: () => Promise<Locator>;

  /**
   * Pagination control locator
   */
  paginationControl: Locator;

  /**
   * Wait for pagination control to be visible and return it.
   */
  waitForPaginationControl: () => Promise<Locator>;

  /**
   * Asserts that the data table exactly matches the expected data.
   */
  assertDataTableMatches: (expected: ExpectedData) => Promise<void>;

  /**
   * Exports the data table to CSV.
   *
   * @param pathToSave The path to save the downloaded CSV file.
   */
  exportTableToCSV: (pathToSave: string) => Promise<void>;
};

/**
 * Returns all header cells inside the data table.
 *
 * @param dataTable The data table locator.
 * @returns All header cells locator.
 */
export const getAllHeaderCells = (dataTable: Locator) =>
  dataTable.getByTestId(/^data-table-header-cell-container-.*$/);

/**
 * Returns the header cell for a given column name.
 *
 * @param dataTable The data table locator.
 * @param columnName The column name.
 * @returns
 */
export const getHeaderCell = (dataTable: Locator, columnName: string) =>
  dataTable.getByTestId(`data-table-header-cell-container-${columnName}`);

/**
 * Returns the data cell container for a given column name and row index.
 *
 * @param dataTable The data table locator.
 * @param columnName The column name.
 * @param rowIndex The row index.
 * @returns
 */
export const getDataCellContainer = (dataTable: Locator, columnName: string, rowIndex: number) =>
  dataTable.getByTestId(`data-table-cell-container-${columnName}-${rowIndex}`);

/**
 * Returns the data cell value for a given column name and row index.
 *
 * @param dataTable The data table locator.
 * @param columnName The column name.
 * @param rowIndex The row index.
 * @returns
 */
export const getDataCellValue = (
  dataTable: Locator,
  columnName: string,
  rowIndex: number,
  currentPage: number = 0,
) => {
  const relativeRowIndex = rowIndex - currentPage * MAX_DATA_VIEW_PAGE_SIZE;

  return dataTable.getByTestId(`data-table-cell-value-${columnName}-${relativeRowIndex}`);
};

export const test = base.extend<DataViewFixtures>({
  dataTable: async ({ page }, use) => {
    await use(page.getByTestId('data-table'));
  },

  waitForDataTable: async ({ dataTable }, use) => {
    await use(async () => {
      await expect(dataTable).toBeVisible();
      return dataTable;
    });
  },

  paginationControl: async ({ page }, use) => {
    await use(page.getByTestId('data-table-pagination-control'));
  },

  waitForPaginationControl: async ({ paginationControl }, use) => {
    await use(async () => {
      await expect(paginationControl).toBeVisible();
      return paginationControl;
    });
  },

  assertDataTableMatches: async ({ waitForDataTable }, use) => {
    await use(async (expected: ExpectedData, currentPage: number = 0) => {
      // Wait for the data table to be visible
      const dataTable = await waitForDataTable();

      // Check if the data table has the expected column count first
      const columns = Object.keys(expected);
      const headerCells = getAllHeaderCells(dataTable);

      // We always have an extra column for the row number
      await expect(headerCells).toHaveCount(columns.length + 1);

      // Check row number header cell
      const rowNumberHeaderCell = getHeaderCell(dataTable, '__index__');
      await expect(rowNumberHeaderCell).toBeVisible();
      await expect(rowNumberHeaderCell).toHaveText('#');

      // Check row number data cells (assuming all columns have the same number of rows)
      const rowCount = expected[columns[0]].length;
      for (let i = 0; i < rowCount; i += 1) {
        const rowNumberCell = getDataCellValue(dataTable, '#', i, currentPage);
        await expect(rowNumberCell).toBeVisible();
        await expect(rowNumberCell).toHaveText(String(i + 1));
      }

      // Now check if the data table has the expected data
      for (const [column, values] of Object.entries(expected)) {
        const columnId = replaceSpecialChars(column);
        const headerCell = getHeaderCell(dataTable, columnId);
        await expect(headerCell).toBeVisible({ timeout: 0 });
        await expect(headerCell).toHaveText(column);

        for (let i = 0; i < values.length; i += 1) {
          const cellValue = getDataCellValue(dataTable, columnId, i);
          await expect(cellValue).toBeVisible({ timeout: 0 });
          await expect(cellValue).toHaveText(String(values[i]));
        }
      }
    });
  },

  exportTableToCSV: async ({ page }, use) => {
    await use(async (pathToSave: string) => {
      // Start waiting for download before clicking. Note no await.
      const downloadPromise = page.waitForEvent('download');

      // Click the export button
      const exportButton = page.getByTestId('export-table-csv-button');
      await expect(exportButton).toBeVisible();
      await exportButton.click();

      // Get the special playwright download object
      const download = await downloadPromise;

      // Save the downloaded file
      await download.saveAs(pathToSave);
    });
  },
});
