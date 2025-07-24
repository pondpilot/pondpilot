/**
 * HTTPServer table data viewing tests with mocked server responses
 */

import { expect, mergeTests } from '@playwright/test';

import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as httpServerTest } from '../fixtures/http-server';
import { test as baseTest } from '../fixtures/page';
import { test as spotlightTest } from '../fixtures/spotlight';

const test = mergeTests(baseTest, spotlightTest, httpServerTest, fileSystemExplorerTest);

test.describe('HTTPServer Table Data Tests', () => {
  test('should view table data from HTTP server', async ({
    page,
    openDatasourceWizard,
    setupHttpServerMocks,
  }) => {
    // Setup mock server with sample data
    await setupHttpServerMocks({
      connectionSuccess: true,
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'INTEGER' },
            { name: 'name', type: 'VARCHAR' },
            { name: 'email', type: 'VARCHAR' },
          ],
        },
      ],
    });

    // Add database through wizard
    await openDatasourceWizard();
    await page.getByTestId('datasource-modal-add-http-server-card').click();
    await page.getByTestId('test-http-server-connection-button').click();
    await expect(page.getByText('Connection successful')).toBeVisible();
    await page.getByTestId('add-http-server-button').click();

    // Wait for database to be added and expand it
    await expect(page.getByText('main ✓')).toBeVisible({ timeout: 10000 });
    await page.getByText('main ✓').click();

    // Expand schema 'main' inside the database
    await expect(page.getByText('main').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByText('main').nth(1).click();

    // Click on users table to view its data
    await expect(page.getByText('users').first()).toBeVisible({ timeout: 10000 });
    await page.getByText('users').first().click();

    // Should show table data in the data viewer
    // Check for sample data first
    await expect(page.getByText('John Doe')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('jane@example.com')).toBeVisible({ timeout: 10000 });

    // Check for column headers
    await expect(page.getByText('id')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('name')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('email')).toBeVisible({ timeout: 10000 });
  });
});
