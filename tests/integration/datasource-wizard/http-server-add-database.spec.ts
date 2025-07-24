/**
 * HTTPServer database addition tests with mocked server responses
 */

import { expect, mergeTests } from '@playwright/test';

import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as httpServerTest } from '../fixtures/http-server';
import { test as baseTest } from '../fixtures/page';
import { test as spotlightTest } from '../fixtures/spotlight';
import { clickExplorerTreeNodeMenuItemByName } from '../fixtures/utils/explorer-tree';

const test = mergeTests(baseTest, spotlightTest, httpServerTest, fileSystemExplorerTest);

const HTTPSERVER_EXPLORER_PREFIX = 'data-explorer-httpserver';

test.describe('HTTPServer Database Addition Tests', () => {
  test('should successfully add HTTP server database', async ({
    page,
    openDatasourceWizard,
    setupHttpServerMocks,
  }) => {
    // Setup mock server with successful connection and sample tables
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
        {
          name: 'orders',
          columns: [
            { name: 'id', type: 'INTEGER' },
            { name: 'user_id', type: 'INTEGER' },
            { name: 'amount', type: 'DOUBLE' },
          ],
        },
      ],
    });

    // Open datasource wizard
    await openDatasourceWizard();

    // Navigate to HTTP server config
    await page.getByTestId('datasource-modal-add-http-server-card').click();

    // Should show HTTP server configuration form
    await expect(page.getByText('Connect to a DuckDB HTTP Server instance')).toBeVisible();

    // Test connection should succeed
    await page.getByTestId('test-http-server-connection-button').click();
    await expect(page.getByText('Connection successful')).toBeVisible({ timeout: 10000 });

    // Add database
    await page.getByTestId('add-http-server-button').click();

    // Should close modal and show database in explorer
    await expect(page.getByTestId('datasource-modal')).not.toBeVisible({ timeout: 10000 });

    // Check that HTTP Server Databases section appears in data explorer
    await expect(page.getByText('HTTP Server Databases')).toBeVisible({ timeout: 15000 });

    // Check that database node appears (with connection state indicator)
    await expect(page.getByText('main ✓')).toBeVisible({ timeout: 10000 });
  });

  test('should show database tables after adding HTTP server', async ({
    page,
    openDatasourceWizard,
    setupHttpServerMocks,
  }) => {
    // Setup mock server
    await setupHttpServerMocks({
      connectionSuccess: true,
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'INTEGER' },
            { name: 'name', type: 'VARCHAR' },
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

    // Wait for database to be added
    await expect(page.getByText('main ✓')).toBeVisible({ timeout: 10000 });

    // Click to expand database node
    await page.getByText('main ✓').click();

    // Expand schema 'main' inside the database
    await expect(page.getByText('main').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByText('main').nth(1).click();

    // Should show table in the database
    await expect(page.getByText('users')).toBeVisible({ timeout: 10000 });
  });

  test('should refresh HTTP server schema and show new tables', async ({
    page,
    openDatasourceWizard,
    setupHttpServerMocks,
  }) => {
    // Setup initial mock server with one table
    await setupHttpServerMocks({
      connectionSuccess: true,
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'INTEGER' },
            { name: 'name', type: 'VARCHAR' },
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
    await expect(page.getByText('main').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByText('main').nth(1).click();

    // Verify initial table is present
    await expect(page.getByText('users')).toBeVisible({ timeout: 10000 });

    // Update mock to include a new table
    await setupHttpServerMocks({
      connectionSuccess: true,
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'INTEGER' },
            { name: 'name', type: 'VARCHAR' },
          ],
        },
        {
          name: 'orders',
          columns: [
            { name: 'id', type: 'INTEGER' },
            { name: 'user_id', type: 'INTEGER' },
            { name: 'amount', type: 'DOUBLE' },
          ],
        },
      ],
    });

    // Use proper context menu helper to refresh the database
    await clickExplorerTreeNodeMenuItemByName(
      page,
      HTTPSERVER_EXPLORER_PREFIX,
      'main ✓',
      'Refresh'
    );

    // Wait for refresh notification
    await expect(page.getByText('Successfully refreshed schema')).toBeVisible({ timeout: 10000 });

    // The tree should remain expanded after refresh, so both tables should be visible immediately
    // Both tables should now be visible
    await expect(page.getByText('users')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('orders')).toBeVisible({ timeout: 10000 });
  });
});
