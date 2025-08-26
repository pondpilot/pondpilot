import { expect, mergeTests } from '@playwright/test';

import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as baseTest } from '../fixtures/page';

const test = mergeTests(baseTest, fileSystemExplorerTest);

test.describe('Clipboard Import', () => {
  test('should import CSV data from clipboard', async ({ page, openDatasourceWizard }) => {
    // 1. Mock clipboard API with CSV data and permission as granted
    const csvData = 'id,name,age\n1,John,30\n2,Jane,25';
    await page.evaluate((data) => {
      Object.defineProperty(navigator.clipboard, 'readText', {
        value: async () => data,
        writable: true,
        configurable: true,
      });
      // Mock permissions API to return granted state
      if (navigator.permissions) {
        Object.defineProperty(navigator.permissions, 'query', {
          value: async () => ({ state: 'granted' }),
          writable: true,
          configurable: true,
        });
      }
    }, csvData);

    // 2. Open datasource wizard
    await openDatasourceWizard();

    // Wait for wizard modal to be visible (Mantine modal)
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // 3. Since permission is granted and content exists, CSV/JSON alert should appear automatically
    const clipboardAlert = page.getByTestId('clipboard-alert');
    await expect(clipboardAlert).toBeVisible({ timeout: 5000 });

    // Check banner should not be visible when permission is already granted
    const clipboardCheckBanner = page.getByTestId('clipboard-check-banner');
    await expect(clipboardCheckBanner).toBeHidden();

    // Click CSV button directly (new UI has direct buttons)
    const csvButton = page.getByTestId('paste-as-csv');
    await csvButton.click();

    // 5. Configure import settings
    // Check that preview shows the CSV data
    const preview = page.getByTestId('clipboard-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveValue(/id,name,age/);

    // Enter dataset name
    const nameInput = page.getByTestId('clipboard-dataset-name');
    await nameInput.fill('test_clipboard_data');

    // Leave "First row contains headers" checkbox checked (default)
    const headersCheckbox = page.getByTestId('clipboard-has-headers');
    await expect(headersCheckbox).toBeChecked();

    // Import the dataset
    const importButton = page.getByTestId('clipboard-import-button');
    await importButton.click();

    // 6. Verify table creation succeeded
    // Wait for modal to close
    await expect(modal).toBeHidden({ timeout: 10000 });

    // Wait for success notification
    const successNotification = page.getByText('Table created');
    await expect(successNotification).toBeVisible({ timeout: 5000 });

    // Verify table was created successfully by checking success message
    await expect(
      page.getByText("Table 'test_clipboard_data' has been created successfully"),
    ).toBeVisible();
  });

  test('should import JSON data from clipboard', async ({ page, openDatasourceWizard }) => {
    // 1. Mock clipboard API with JSON data
    const jsonData = JSON.stringify(
      [
        { id: 1, name: 'Alice', department: 'Engineering' },
        { id: 2, name: 'Bob', department: 'Marketing' },
        { id: 3, name: 'Charlie', department: 'Sales' },
      ],
      null,
      2,
    );
    await page.evaluate((data) => {
      Object.defineProperty(navigator.clipboard, 'readText', {
        value: async () => data,
        writable: true,
        configurable: true,
      });
    }, jsonData);

    // 2. Open datasource wizard
    await openDatasourceWizard();

    // Wait for wizard modal to be visible (Mantine modal)
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // 3. Since permission is granted and content exists, CSV/JSON alert should appear automatically
    const clipboardAlert = page.getByTestId('clipboard-alert');
    await expect(clipboardAlert).toBeVisible({ timeout: 5000 });

    // Check banner should not be visible when permission is already granted
    const clipboardCheckBanner = page.getByTestId('clipboard-check-banner');
    await expect(clipboardCheckBanner).toBeHidden();

    // Click JSON button directly (new UI has direct buttons)
    const jsonButton = page.getByTestId('paste-as-json');
    await jsonButton.click();

    // 5. Configure import settings
    // Check that preview shows the JSON data
    const preview = page.getByTestId('clipboard-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveValue(/Alice/); // JSON is multiline, so just check for Alice

    // Enter dataset name
    const nameInput = page.getByTestId('clipboard-dataset-name');
    await nameInput.fill('test_json_data');

    // For JSON, there's no headers checkbox (only for CSV)

    // Import the dataset
    const importButton = page.getByTestId('clipboard-import-button');
    await importButton.click();

    // 6. Verify table creation succeeded
    // Wait for modal to close
    await expect(modal).toBeHidden({ timeout: 10000 });

    // Wait for success notification
    const successNotification = page.getByText('Table created');
    await expect(successNotification).toBeVisible({ timeout: 5000 });

    // Verify table was created successfully by checking success message
    await expect(
      page.getByText("Table 'test_json_data' has been created successfully"),
    ).toBeVisible();
  });

  test('should import CSV without headers and generate column names', async ({
    page,
    openDatasourceWizard,
  }) => {
    // 1. Mock clipboard API with CSV data WITHOUT headers
    const csvData = '1,John,30\n2,Jane,25\n3,Mike,35';
    await page.evaluate((data) => {
      Object.defineProperty(navigator.clipboard, 'readText', {
        value: async () => data,
        writable: true,
        configurable: true,
      });
      // Mock permissions API to return granted state
      if (navigator.permissions) {
        Object.defineProperty(navigator.permissions, 'query', {
          value: async () => ({ state: 'granted' }),
          writable: true,
          configurable: true,
        });
      }
    }, csvData);

    // 2. Open datasource wizard
    await openDatasourceWizard();

    // Wait for wizard modal to be visible (Mantine modal)
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // 3. Since permission is granted and content exists, CSV/JSON alert should appear automatically
    const clipboardAlert = page.getByTestId('clipboard-alert');
    await expect(clipboardAlert).toBeVisible({ timeout: 5000 });

    // Check banner should not be visible when permission is already granted
    const clipboardCheckBanner = page.getByTestId('clipboard-check-banner');
    await expect(clipboardCheckBanner).toBeHidden();

    // Click CSV button directly (new UI has direct buttons)
    const csvButton = page.getByTestId('paste-as-csv');
    await csvButton.click();

    // 5. Configure import settings
    // Check that preview shows the CSV data
    const preview = page.getByTestId('clipboard-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveValue(/1,John,30/);

    // Enter dataset name
    const nameInput = page.getByTestId('clipboard-dataset-name');
    await nameInput.fill('test_no_headers');

    // DISABLE "First row contains headers" checkbox
    const headersCheckbox = page.getByTestId('clipboard-has-headers');
    await expect(headersCheckbox).toBeChecked(); // Default is checked
    await headersCheckbox.click(); // Uncheck it
    await expect(headersCheckbox).not.toBeChecked();

    // Import the dataset
    const importButton = page.getByTestId('clipboard-import-button');
    await importButton.click();

    // 6. Verify table creation succeeded
    // Wait for modal to close
    await expect(modal).toBeHidden({ timeout: 10000 });

    // Wait for success notification
    const successNotification = page.getByText('Table created');
    await expect(successNotification).toBeVisible({ timeout: 5000 });

    // Verify table was created successfully by checking success message
    await expect(
      page.getByText("Table 'test_no_headers' has been created successfully"),
    ).toBeVisible();
  });

  test('should import TSV data (tab-separated values) from clipboard', async ({
    page,
    openDatasourceWizard,
  }) => {
    // 1. Mock clipboard API with TSV data (tab-separated)
    const tsvData = 'id\tname\tage\n1\tJohn\t30\n2\tJane\t25';
    await page.evaluate((data) => {
      Object.defineProperty(navigator.clipboard, 'readText', {
        value: async () => data,
        writable: true,
        configurable: true,
      });
    }, tsvData);

    // 2. Open datasource wizard
    await openDatasourceWizard();

    // Wait for wizard modal to be visible (Mantine modal)
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // 3. Since permission is granted and content exists, CSV/JSON alert should appear automatically
    const clipboardAlert = page.getByTestId('clipboard-alert');
    await expect(clipboardAlert).toBeVisible({ timeout: 5000 });

    // Check banner should not be visible when permission is already granted
    const clipboardCheckBanner = page.getByTestId('clipboard-check-banner');
    await expect(clipboardCheckBanner).toBeHidden();

    // Click CSV button directly (handles both CSV and TSV)
    const csvButton = page.getByTestId('paste-as-csv');
    await csvButton.click();

    // 5. Configure import settings
    // Check that preview shows the TSV data
    const preview = page.getByTestId('clipboard-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveValue(/id\tname\tage/);

    // Enter dataset name
    const nameInput = page.getByTestId('clipboard-dataset-name');
    await nameInput.fill('test_tsv_data');

    // Leave "First row contains headers" checkbox checked (default)
    const headersCheckbox = page.getByTestId('clipboard-has-headers');
    await expect(headersCheckbox).toBeChecked();

    // Import the dataset
    const importButton = page.getByTestId('clipboard-import-button');
    await importButton.click();

    // 6. Verify table creation succeeded
    // Wait for modal to close
    await expect(modal).toBeHidden({ timeout: 10000 });

    // Wait for success notification
    const successNotification = page.getByText('Table created');
    await expect(successNotification).toBeVisible({ timeout: 5000 });

    // Verify table was created successfully by checking success message
    await expect(
      page.getByText("Table 'test_tsv_data' has been created successfully"),
    ).toBeVisible();
  });

  test('should show check clipboard button when permission is unknown', async ({
    page,
    openDatasourceWizard,
  }) => {
    // 1. Mock clipboard API with unknown permission state
    await page.evaluate(() => {
      // Mock permissions API to return unknown state
      if (navigator.permissions) {
        Object.defineProperty(navigator.permissions, 'query', {
          value: async () => ({ state: 'prompt' }),
          writable: true,
          configurable: true,
        });
      }
    });

    // 2. Open datasource wizard
    await openDatasourceWizard();

    // Wait for wizard modal to be visible
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // 3. Should show "Check clipboard" button when permission is unknown
    const clipboardCheckBanner = page.getByTestId('clipboard-check-banner');
    await expect(clipboardCheckBanner).toBeVisible({ timeout: 5000 });

    const checkClipboardButton = page.getByTestId('check-clipboard-button');
    await expect(checkClipboardButton).toBeVisible();

    // Should not show clipboard alert or blocked notification
    const clipboardAlert = page.getByTestId('clipboard-alert');
    await expect(clipboardAlert).toBeHidden();
  });

  test('should show blocked access notification when clipboard permission is denied', async ({
    page,
    openDatasourceWizard,
  }) => {
    // 1. Clear localStorage and mock clipboard permission as denied
    await page.evaluate(() => {
      // Clear localStorage to ensure notification is not dismissed
      localStorage.removeItem('clipboard-permission-dismissed');
      // Mock clipboard API to throw permission denied error
      Object.defineProperty(navigator.clipboard, 'readText', {
        value: async () => {
          throw new DOMException('Permission denied', 'NotAllowedError');
        },
        writable: true,
        configurable: true,
      });

      // Mock permissions API to return denied state
      if (navigator.permissions) {
        Object.defineProperty(navigator.permissions, 'query', {
          value: async () => ({ state: 'denied' }),
          writable: true,
          configurable: true,
        });
      }
    });

    // 2. Open datasource wizard
    await openDatasourceWizard();

    // Wait for wizard modal to be visible
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // 3. Should NOT show clipboard check banner or clipboard data alert
    const clipboardCheckBanner = page.getByTestId('clipboard-check-banner');
    await expect(clipboardCheckBanner).toBeHidden();
    
    const clipboardAlert = page.getByTestId('clipboard-alert');
    await expect(clipboardAlert).toBeHidden();

    // 4. Should show blocked access notification
    const blockedAlert = page.getByText('Clipboard access blocked');
    await expect(blockedAlert).toBeVisible({ timeout: 10000 });

    // Check that the instruction text is present
    const instructionText = page.getByText(/click the 🔒 icon in your browser/);
    await expect(instructionText).toBeVisible();
  });
});
