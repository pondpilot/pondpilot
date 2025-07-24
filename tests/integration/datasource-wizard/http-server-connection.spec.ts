/**
 * HTTPServer connection tests with mocked server responses
 */

import { expect, mergeTests } from '@playwright/test';

import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as httpServerTest } from '../fixtures/http-server';
import { test as baseTest } from '../fixtures/page';
import { test as spotlightTest } from '../fixtures/spotlight';

const test = mergeTests(baseTest, spotlightTest, httpServerTest, fileSystemExplorerTest);

test.describe('HTTPServer Connection Tests', () => {
  test('should successfully test connection to HTTP server', async ({
    page,
    openDatasourceWizard,
    setupHttpServerMocks,
  }) => {
    // Setup mock server with successful connection
    await setupHttpServerMocks({ connectionSuccess: true });

    // Open datasource wizard
    await openDatasourceWizard();

    // Navigate to HTTP server config
    await page.getByTestId('datasource-modal-add-http-server-card').click();

    // Should show HTTP server configuration form
    await expect(page.getByText('Connect to a DuckDB HTTP Server instance')).toBeVisible();

    // Test connection should succeed
    await page.getByTestId('test-http-server-connection-button').click();

    // Should show success message (avoiding notifications, checking for text on page)
    await expect(page.getByText('Connection successful')).toBeVisible({ timeout: 10000 });
  });

  test('should show error when connection fails', async ({
    page,
    openDatasourceWizard,
    setupHttpServerMocks,
  }) => {
    // Setup mock server with failed connection
    await setupHttpServerMocks({ connectionSuccess: false });

    // Open datasource wizard
    await openDatasourceWizard();

    // Navigate to HTTP server config
    await page.getByTestId('datasource-modal-add-http-server-card').click();

    // Test connection should fail
    await page.getByTestId('test-http-server-connection-button').click();

    // Should show error message
    await expect(page.getByText('Connection failed')).toBeVisible({ timeout: 10000 });
  });
});
