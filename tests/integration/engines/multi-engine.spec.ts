import { expect, mergeTests } from '@playwright/test';

import { test as baseTest } from '../fixtures/page';
import { test as spotlightTest } from '../fixtures/spotlight';

const test = mergeTests(baseTest, spotlightTest);

test.describe('Multi-Engine Database Support', () => {
  test('should execute basic queries', async ({ page, createScriptViaSpotlight }) => {
    // Open SQL editor
    await createScriptViaSpotlight();

    // Create test data
    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.type('CREATE TABLE test_data (id INT, name VARCHAR);');
    await page.keyboard.press('Control+Enter');

    // Wait for execution
    await page.waitForTimeout(500);

    // Insert data
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type("INSERT INTO test_data VALUES (1, 'Alice'), (2, 'Bob');");
    await page.keyboard.press('Control+Enter');

    // Wait for execution
    await page.waitForTimeout(500);

    // Query data
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('SELECT * FROM test_data ORDER BY id;');
    await page.keyboard.press('Control+Enter');

    // Verify results
    await expect(page.getByText('Alice')).toBeVisible();
    await expect(page.getByText('Bob')).toBeVisible();
  });

  test('should handle file operations', async ({ page, createScriptViaSpotlight }) => {
    // Create a CSV file content
    const csvContent = 'id,name,age\n1,John,30\n2,Jane,25\n3,Bob,35';

    // Mock file picker
    await page.evaluate((content) => {
      const blob = new Blob([content], { type: 'text/csv' });
      const file = new File([blob], 'test_users.csv', { type: 'text/csv' });

      Object.defineProperty(window, 'showOpenFilePicker', {
        value: async () => [
          {
            getFile: async () => file,
            name: 'test_users.csv',
            kind: 'file',
            queryPermission: async () => ({ state: 'granted' }),
            requestPermission: async () => ({ state: 'granted' }),
          },
        ],
        writable: true,
        configurable: true,
      });
    }, csvContent);

    // Add file through UI
    await page.getByTestId('navbar-add-datasource-button').click();
    const addFileCard = page.getByTestId('datasource-modal-add-file-card');
    await expect(addFileCard).toBeVisible();
    await addFileCard.click();
    await expect(addFileCard).toBeHidden();

    // Query the file
    await createScriptViaSpotlight();

    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.type("SELECT * FROM 'test_users.csv' ORDER BY id;");
    await page.keyboard.press('Control+Enter');

    // Verify results
    await expect(page.getByText('John')).toBeVisible();
    await expect(page.getByText('Jane')).toBeVisible();
    await expect(page.getByText('Bob')).toBeVisible();
  });

  test('should handle transactions', async ({ page, createScriptViaSpotlight }) => {
    // Open SQL editor
    await createScriptViaSpotlight();

    const editor = page.locator('.cm-content');

    // Create table
    await editor.click();
    await page.keyboard.type('CREATE TABLE transaction_test (id INT PRIMARY KEY, value INT);');
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(500);

    // Start transaction and insert data
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('BEGIN TRANSACTION;');
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(200);

    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('INSERT INTO transaction_test VALUES (1, 100), (2, 200);');
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(200);

    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('COMMIT;');
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(200);

    // Verify data
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('SELECT COUNT(*) as count FROM transaction_test;');
    await page.keyboard.press('Control+Enter');

    await expect(page.getByText('2', { exact: true })).toBeVisible();
  });
});
