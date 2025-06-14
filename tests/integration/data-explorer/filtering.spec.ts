import { expect, mergeTests } from '@playwright/test';

import { createFile } from '../../utils';
import { test as dbExplorerTest } from '../fixtures/db-explorer';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as baseTest } from '../fixtures/page';
import { test as testTmpTest } from '../fixtures/test-tmp';

const test = mergeTests(baseTest, fileSystemExplorerTest, dbExplorerTest, testTmpTest);

test.describe('Data Explorer Filtering', () => {
  test.beforeEach(async ({ testTmp }) => {
    // Create test files
    await createFile(testTmp.join('test.csv'), 'name,value\ntest1,1\ntest2,2');
    await createFile(testTmp.join('data.json'), '{"test": "data"}');
    await createFile(testTmp.join('report.parquet'), 'dummy parquet data');
    await createFile(testTmp.join('sheet.xlsx'), 'dummy excel data');
    await createFile(testTmp.join('notes.txt'), 'plain text file');
    await createFile(testTmp.join('script.sql'), 'SELECT * FROM test;');
  });

  test('should show quick filter buttons', async ({ page }) => {
    const filterContainer = page.getByTestId('data-explorer-filters');
    await expect(filterContainer).toBeVisible();

    // Check for filter buttons
    await expect(page.getByRole('button', { name: /all/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /files/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /databases/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /remote/i })).toBeVisible();
  });

  test('should filter by type when clicking filter buttons', async ({
    page,
    addFileButton,
    fileSystemExplorer,
    testTmp,
  }) => {
    // Add test files
    await addFileButton.click();
    const fileInput = page.locator('input[type="file"]');
    const filePaths = ['test.csv', 'data.json', 'notes.txt'].map((file) => testTmp.join(file));

    await fileInput.setInputFiles(filePaths);
    await page.waitForTimeout(500);

    // Check that all files are visible initially
    await expect(fileSystemExplorer).toContainText('test.csv');
    await expect(fileSystemExplorer).toContainText('data.json');
    await expect(fileSystemExplorer).toContainText('notes.txt');

    // Click files filter - should still show all files
    await page.getByRole('button', { name: /files/i, exact: true }).click();
    await expect(fileSystemExplorer).toContainText('test.csv');
    await expect(fileSystemExplorer).toContainText('data.json');
    await expect(fileSystemExplorer).toContainText('notes.txt');

    // Click databases filter - should hide files
    await page.getByRole('button', { name: /databases/i }).click();
    await expect(fileSystemExplorer).not.toContainText('test.csv');
    await expect(fileSystemExplorer).not.toContainText('data.json');
    await expect(fileSystemExplorer).not.toContainText('notes.txt');

    // Click all filter - should show everything again
    await page.getByRole('button', { name: /all/i }).click();
    await expect(fileSystemExplorer).toContainText('test.csv');
    await expect(fileSystemExplorer).toContainText('data.json');
    await expect(fileSystemExplorer).toContainText('notes.txt');
  });

  test('should filter by file type using dropdown', async ({
    page,
    addFileButton,
    fileSystemExplorer,
    testTmp,
  }) => {
    // Add test files
    await addFileButton.click();
    const fileInput = page.locator('input[type="file"]');
    const filePaths = ['test.csv', 'data.json', 'report.parquet', 'notes.txt'].map((file) =>
      testTmp.join(file),
    );

    await fileInput.setInputFiles(filePaths);
    await page.waitForTimeout(500);

    // Open file type dropdown
    const fileTypeDropdown = page.getByTestId('file-type-filter');
    await fileTypeDropdown.click();

    // Select CSV only
    await page.getByRole('option', { name: /csv/i }).click();

    // Should only show CSV files
    await expect(fileSystemExplorer).toContainText('test.csv');
    await expect(fileSystemExplorer).not.toContainText('data.json');
    await expect(fileSystemExplorer).not.toContainText('report.parquet');
    await expect(fileSystemExplorer).not.toContainText('notes.txt');

    // Select JSON
    await fileTypeDropdown.click();
    await page.getByRole('option', { name: /json/i }).click();

    // Should show CSV and JSON files
    await expect(fileSystemExplorer).toContainText('test.csv');
    await expect(fileSystemExplorer).toContainText('data.json');
    await expect(fileSystemExplorer).not.toContainText('report.parquet');
    await expect(fileSystemExplorer).not.toContainText('notes.txt');

    // Clear selection
    await fileTypeDropdown.click();
    await page.getByRole('button', { name: /clear/i }).click();

    // Should show all files again
    await expect(fileSystemExplorer).toContainText('test.csv');
    await expect(fileSystemExplorer).toContainText('data.json');
    await expect(fileSystemExplorer).toContainText('report.parquet');
    await expect(fileSystemExplorer).toContainText('notes.txt');
  });

  test('should search with fuzzy matching', async ({
    page,
    addFileButton,
    fileSystemExplorer,
    testTmp,
  }) => {
    // Add test files with varied names
    await addFileButton.click();
    const fileInput = page.locator('input[type="file"]');
    const testFiles = [
      'customer_data.csv',
      'CustomerInfo.json',
      'cust_details.txt',
      'orders_2024.csv',
      'product_catalog.json',
    ];

    // Create files
    for (const file of testFiles) {
      await createFile(testTmp.join(file), 'test content');
    }

    const filePaths = testFiles.map((file) => testTmp.join(file));
    await fileInput.setInputFiles(filePaths);
    await page.waitForTimeout(500);

    // Search for "cust" - should match customer files with fuzzy matching
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('cust');
    await page.waitForTimeout(300); // Debounce delay

    // Should show files with "cust" in the name (fuzzy match)
    await expect(fileSystemExplorer).toContainText('customer_data.csv');
    await expect(fileSystemExplorer).toContainText('CustomerInfo.json');
    await expect(fileSystemExplorer).toContainText('cust_details.txt');
    await expect(fileSystemExplorer).not.toContainText('orders_2024.csv');
    await expect(fileSystemExplorer).not.toContainText('product_catalog.json');

    // Search for "csv" - should match CSV files
    await searchInput.clear();
    await searchInput.fill('csv');
    await page.waitForTimeout(300);

    await expect(fileSystemExplorer).toContainText('customer_data.csv');
    await expect(fileSystemExplorer).toContainText('orders_2024.csv');
    await expect(fileSystemExplorer).not.toContainText('CustomerInfo.json');
    await expect(fileSystemExplorer).not.toContainText('cust_details.txt');
    await expect(fileSystemExplorer).not.toContainText('product_catalog.json');

    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(300);

    // Should show all files again
    for (const file of testFiles) {
      await expect(fileSystemExplorer).toContainText(file);
    }
  });

  test('should persist filter settings across page reloads', async ({
    page,
    addFileButton,
    fileSystemExplorer,
    testTmp,
    reloadPage,
  }) => {
    // Add test files
    await addFileButton.click();
    const fileInput = page.locator('input[type="file"]');
    const filePaths = ['test.csv', 'data.json'].map((file) => testTmp.join(file));

    await fileInput.setInputFiles(filePaths);
    await page.waitForTimeout(500);

    // Set a filter
    await page.getByRole('button', { name: /files/i, exact: true }).click();

    // Set file type filter
    const fileTypeDropdown = page.getByTestId('file-type-filter');
    await fileTypeDropdown.click();
    await page.getByRole('option', { name: /csv/i }).click();

    // Set search
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('test');
    await page.waitForTimeout(300);

    // Verify current state
    await expect(fileSystemExplorer).toContainText('test.csv');
    await expect(fileSystemExplorer).not.toContainText('data.json');

    // Reload page
    await reloadPage();

    // Check that filters are preserved
    await expect(page.getByRole('button', { name: /files/i, exact: true })).toHaveAttribute(
      'data-active',
      'true',
    );
    await expect(fileTypeDropdown).toContainText('CSV');
    await expect(searchInput).toHaveValue('test');

    // Check that filtered results are still shown
    await expect(fileSystemExplorer).toContainText('test.csv');
    await expect(fileSystemExplorer).not.toContainText('data.json');
  });

  test('should handle combined filters correctly', async ({
    page,
    addFileButton,
    fileSystemExplorer,
    testTmp,
  }) => {
    // Add various test files
    await addFileButton.click();
    const fileInput = page.locator('input[type="file"]');
    const testFiles = [
      'sales_data.csv',
      'sales_report.json',
      'customer_data.csv',
      'customer_info.json',
      'inventory.parquet',
      'notes.txt',
    ];

    for (const file of testFiles) {
      await createFile(testTmp.join(file), 'test content');
    }

    const filePaths = testFiles.map((file) => testTmp.join(file));
    await fileInput.setInputFiles(filePaths);
    await page.waitForTimeout(500);

    // Apply multiple filters
    // 1. Filter by file type (CSV)
    const fileTypeDropdown = page.getByTestId('file-type-filter');
    await fileTypeDropdown.click();
    await page.getByRole('option', { name: /csv/i }).click();

    // Should show only CSV files
    await expect(fileSystemExplorer).toContainText('sales_data.csv');
    await expect(fileSystemExplorer).toContainText('customer_data.csv');
    await expect(fileSystemExplorer).not.toContainText('sales_report.json');
    await expect(fileSystemExplorer).not.toContainText('customer_info.json');

    // 2. Add search filter for "sales"
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('sales');
    await page.waitForTimeout(300);

    // Should show only CSV files with "sales" in the name
    await expect(fileSystemExplorer).toContainText('sales_data.csv');
    await expect(fileSystemExplorer).not.toContainText('customer_data.csv');
    await expect(fileSystemExplorer).not.toContainText('sales_report.json');
  });
});
