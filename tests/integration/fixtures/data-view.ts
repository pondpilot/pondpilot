import { DataCell } from '@models/db';
import { MAX_DATA_VIEW_PAGE_SIZE } from '@models/tab';
import { test as base, expect, Locator } from '@playwright/test';
import { getTableColumnId } from '@utils/db';

/**
 * Input format for assertDataTableMatches that supports raw DataTable
 */
type ExpectedData = {
  data: DataCell[][];
  columnNames: string[];
};

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

  /**
   * Exports the data table to CSV with advanced options.
   *
   * @param options The export options.
   */
  exportTableToCSVAdvanced: (options: {
    path: string;
    delimiter?: string;
    includeHeader?: boolean;
    filename?: string;
  }) => Promise<void>;

  /**
   * Opens the export modal and selects the desired format.
   *
   * @param format The export format.
   */
  openExportModalAndSelectFormat: (
    format: 'csv' | 'tsv' | 'xlsx' | 'sql' | 'xml' | 'md',
  ) => Promise<void>;

  /**
   * Exports the data table to TSV with advanced options.
   *
   * @param options The export options.
   */
  exportTableToTSVAdvanced: (options: {
    path: string;
    includeHeader?: boolean;
    filename?: string;
  }) => Promise<void>;

  /**
   * Exports the data table to XLSX with advanced options.
   *
   * @param options The export options.
   */
  exportTableToXLSXAdvanced: (options: {
    path: string;
    includeHeader?: boolean;
    sheetName?: string;
    filename?: string;
  }) => Promise<void>;

  /**
   * Exports the data table to SQL with advanced options.
   *
   * @param options The export options.
   */
  exportTableToSQLAdvanced: (options: {
    path: string;
    tableName?: string;
    includeCreateTable?: boolean;
    includeDataTypes?: boolean;
    filename?: string;
  }) => Promise<void>;

  /**
   * Exports the data table to XML with advanced options.
   *
   * @param options The export options.
   */
  exportTableToXMLAdvanced: (options: {
    path: string;
    includeHeader?: boolean;
    rootElement?: string;
    rowElement?: string;
    filename?: string;
  }) => Promise<void>;

  /**
   * Exports the data table to Markdown with advanced options.
   *
   * @param options The export options.
   */
  exportTableToMarkdownAdvanced: (options: {
    path: string;
    includeHeader?: boolean;
    mdFormat?: 'github' | 'standard';
    alignColumns?: boolean;
    filename?: string;
  }) => Promise<void>;
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
 * @param columnId The column name.
 * @returns
 */
export const getHeaderCell = (dataTable: Locator, columnId: string) =>
  dataTable.getByTestId(`data-table-header-cell-container-${columnId}`);

/**
 * Returns the data cell container for a given column name and row index.
 *
 * @param dataTable The data table locator.
 * @param columnId The column name.
 * @param rowIndex The row index.
 * @returns
 */
export const getDataCellContainer = (dataTable: Locator, columnId: string, rowIndex: number) =>
  dataTable.getByTestId(`data-table-cell-container-${columnId}-${rowIndex}`);

/**
 * Returns the data cell value for a given column name and row index.
 *
 * @param dataTable The data table locator.
 * @param columnId The column name.
 * @param rowIndex The row index.
 * @returns
 */
export const getDataCellValue = (
  dataTable: Locator,
  columnId: string,
  rowIndex: number,
  currentPage: number = 0,
) => {
  const relativeRowIndex = rowIndex - currentPage * MAX_DATA_VIEW_PAGE_SIZE;

  return dataTable.getByTestId(`data-table-cell-value-${columnId}-${relativeRowIndex}`);
};

export const test = base.extend<DataViewFixtures>({
  dataTable: async ({ page }, use) => {
    await use(page.getByTestId('data-table'));
  },

  waitForDataTable: async ({ dataTable }, use) => {
    await use(async () => {
      await expect(dataTable).toBeVisible({ timeout: 10000 });
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
      const columns = expected.columnNames;
      const headerCells = getAllHeaderCells(dataTable);

      // We always have an extra column for the row number
      await expect(headerCells).toHaveCount(columns.length + 1);

      // Check row number header cell
      const rowNumberHeaderCell = getHeaderCell(dataTable, '__index__');
      await expect(rowNumberHeaderCell).toBeVisible();
      await expect(rowNumberHeaderCell).toHaveText('#');

      // Check row number data cells (assuming all columns have the same number of rows)
      const rowCount = expected.data.length;
      for (let i = 0; i < rowCount; i += 1) {
        const rowNumberCell = getDataCellValue(dataTable, '#', i, currentPage);
        // For the first cell, wait longer to ensure data has loaded
        await expect(rowNumberCell).toBeVisible({ timeout: i === 0 ? 10000 : 0 });
        await expect(rowNumberCell).toHaveText(String(i + 1));
      }

      // Now check if the data table has the expected data
      for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
        const column = columns[colIndex];
        const values = expected.data.map((row) => row[colIndex]);
        const columnId = getTableColumnId(column, colIndex);

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

      // Click the export dropdown button first
      const exportDropdownButton = page.getByTestId('export-table-button');
      await expect(exportDropdownButton).toBeVisible();
      await exportDropdownButton.click();

      // Then click the CSV menu item
      const exportCSVMenuItem = page.getByTestId('export-table-csv-menu-item');
      await expect(exportCSVMenuItem).toBeVisible();
      await exportCSVMenuItem.click();

      // Get the special playwright download object
      const download = await downloadPromise;

      // Save the downloaded file
      await download.saveAs(pathToSave);
    });
  },

  openExportModalAndSelectFormat: async ({ page }, use) => {
    await use(async (format) => {
      // Open the export menu
      const exportDropdownButton = page.getByTestId('export-table-button');
      await exportDropdownButton.click();

      // Click Advanced...
      const advancedMenuItem = page.getByTestId('export-table-advanced-menu-item');
      await advancedMenuItem.click();

      // Wait for the modal to open
      const modal = page.getByTestId('export-options-modal');
      await expect(modal).toBeVisible();

      // Select the desired format
      const formatSelector = page.getByTestId(`export-format-${format}`);
      await formatSelector.click();
    });
  },

  exportTableToCSVAdvanced: async ({ page, openExportModalAndSelectFormat }, use) => {
    await use(async ({ path, delimiter = ',', includeHeader = true, filename = 'export.csv' }) => {
      // Open the modal and select CSV format
      await openExportModalAndSelectFormat('csv');

      // Set CSV options
      if (delimiter !== undefined) {
        const delimiterInput = page.getByTestId('export-csv-delimiter');
        await delimiterInput.fill(delimiter);
      }
      if (includeHeader !== undefined) {
        const headerCheckbox = page.getByTestId('export-include-header');
        const checked = await headerCheckbox.isChecked();
        if (checked !== includeHeader) {
          await headerCheckbox.click();
        }
      }

      // Enter file name
      const filenameInput = page.getByTestId('export-filename');
      await filenameInput.fill(filename);

      // Confirm export
      const exportButton = page.getByTestId('export-confirm');
      const downloadPromise = page.waitForEvent('download');
      await exportButton.click();

      // Wait for download and save file
      const download = await downloadPromise;
      await download.saveAs(path);
    });
  },

  exportTableToTSVAdvanced: async ({ page, openExportModalAndSelectFormat }, use) => {
    await use(async ({ path, includeHeader = true, filename = 'export.tsv' }) => {
      // Open the export modal and select TSV format
      await openExportModalAndSelectFormat('tsv');

      if (includeHeader !== undefined) {
        const headerCheckbox = page.getByTestId('export-include-header');
        const checked = await headerCheckbox.isChecked();
        if (checked !== includeHeader) {
          await headerCheckbox.click();
        }
      }

      // Enter file name
      const filenameInput = page.getByTestId('export-filename');
      await filenameInput.fill(filename);

      // Confirm export
      const exportButton = page.getByTestId('export-confirm');
      const downloadPromise = page.waitForEvent('download');
      await exportButton.click();

      // Wait for download and save file
      const download = await downloadPromise;
      await download.saveAs(path);
    });
  },

  exportTableToXLSXAdvanced: async ({ page, openExportModalAndSelectFormat }, use) => {
    await use(
      async ({ path, includeHeader = true, sheetName = 'Sheet1', filename = 'export.xlsx' }) => {
        // Open the export modal and select XLSX format
        await openExportModalAndSelectFormat('xlsx');

        // Set XLSX options
        if (includeHeader !== undefined) {
          const headerCheckbox = page.getByTestId('export-include-header');
          const checked = await headerCheckbox.isChecked();
          if (checked !== includeHeader) {
            await headerCheckbox.click();
          }
        }
        if (sheetName !== undefined) {
          const sheetNameInput = page.getByTestId('export-xlsx-sheet-name');
          await sheetNameInput.fill(sheetName);
        }

        // Enter file name
        const filenameInput = page.getByTestId('export-filename');
        await filenameInput.fill(filename);

        // Confirm export
        const exportButton = page.getByTestId('export-confirm');
        const downloadPromise = page.waitForEvent('download');
        await exportButton.click();

        // Wait for download and save file
        const download = await downloadPromise;
        await download.saveAs(path);
      },
    );
  },

  exportTableToSQLAdvanced: async ({ page, openExportModalAndSelectFormat }, use) => {
    await use(
      async ({
        path,
        tableName = 'exported_table',
        includeCreateTable = true,
        includeDataTypes = true,
        filename = 'export.sql',
      }) => {
        // Open the export modal and select SQL format
        await openExportModalAndSelectFormat('sql');

        // Set SQL options
        if (tableName !== undefined) {
          const tableNameInput = page.getByTestId('export-sql-table-name');
          await tableNameInput.fill(tableName);
        }
        if (includeCreateTable !== undefined) {
          const createTableCheckbox = page.getByLabel('Include CREATE TABLE statement');
          const checked = await createTableCheckbox.isChecked();
          if (checked !== includeCreateTable) {
            await createTableCheckbox.click();
          }
        }
        if (includeDataTypes !== undefined) {
          const dataTypesCheckbox = page.getByLabel('Include column data types');
          const checked = await dataTypesCheckbox.isChecked();
          if (checked !== includeDataTypes) {
            await dataTypesCheckbox.click();
          }
        }

        // Enter file name
        const filenameInput = page.getByTestId('export-filename');
        await filenameInput.fill(filename);

        // Confirm export
        const exportButton = page.getByTestId('export-confirm');
        const downloadPromise = page.waitForEvent('download');
        await exportButton.click();

        // Wait for download and save file
        const download = await downloadPromise;
        await download.saveAs(path);
      },
    );
  },

  exportTableToXMLAdvanced: async ({ page, openExportModalAndSelectFormat }, use) => {
    await use(
      async ({
        path,
        includeHeader = true,
        rootElement = 'data',
        rowElement = 'row',
        filename = 'export.xml',
      }) => {
        // Open the export modal and select XML format
        await openExportModalAndSelectFormat('xml');

        // Set XML options
        if (includeHeader !== undefined) {
          const headerCheckbox = page.getByTestId('export-include-header');
          const checked = await headerCheckbox.isChecked();
          if (checked !== includeHeader) {
            await headerCheckbox.click();
          }
        }
        if (rootElement !== undefined) {
          const rootInput = page.getByTestId('export-xml-root');
          await rootInput.fill(rootElement);
        }
        if (rowElement !== undefined) {
          const rowInput = page.getByTestId('export-xml-row');
          await rowInput.fill(rowElement);
        }

        // Enter file name
        const filenameInput = page.getByTestId('export-filename');
        await filenameInput.fill(filename);

        // Confirm export
        const exportButton = page.getByTestId('export-confirm');
        const downloadPromise = page.waitForEvent('download');
        await exportButton.click();

        // Wait for download and save file
        const download = await downloadPromise;
        await download.saveAs(path);
      },
    );
  },

  exportTableToMarkdownAdvanced: async ({ page, openExportModalAndSelectFormat }, use) => {
    await use(
      async ({
        path,
        includeHeader = true,
        mdFormat = 'github',
        alignColumns = true,
        filename = 'export.md',
      }) => {
        // Open the export modal and select Markdown format
        await openExportModalAndSelectFormat('md');

        // Set Markdown options
        if (includeHeader !== undefined) {
          const headerCheckbox = page.getByTestId('export-include-header');
          const checked = await headerCheckbox.isChecked();
          if (checked !== includeHeader) {
            await headerCheckbox.click();
          }
        }
        if (mdFormat !== undefined) {
          const mdFormatRadio = page.getByRole('radio', {
            name: mdFormat === 'github' ? 'GitHub' : 'Standard',
          });
          await mdFormatRadio.check();
        }
        if (alignColumns !== undefined) {
          const alignCheckbox = page.getByLabel('Align columns');
          const checked = await alignCheckbox.isChecked();
          if (checked !== alignColumns) {
            await alignCheckbox.click();
          }
        }

        // Enter file name
        const filenameInput = page.getByTestId('export-filename');
        await filenameInput.fill(filename);

        // Confirm export
        const exportButton = page.getByTestId('export-confirm');
        const downloadPromise = page.waitForEvent('download');
        await exportButton.click();

        // Wait for download and save file
        const download = await downloadPromise;
        await download.saveAs(path);
      },
    );
  },
});
