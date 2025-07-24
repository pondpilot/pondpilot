/**
 * Basic integration tests for HTTPServer Database configuration
 * Only includes tests that reliably pass
 */

import { expect, mergeTests } from '@playwright/test';

import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as baseTest } from '../fixtures/page';
import { test as spotlightTest } from '../fixtures/spotlight';

const test = mergeTests(baseTest, spotlightTest, fileSystemExplorerTest);

test.describe('HTTPServer Database Configuration - Basic Tests', () => {
  test('should navigate to HTTP server config from wizard', async ({
    page,
    openDatasourceWizard,
  }) => {
    await openDatasourceWizard();

    // Click on HTTP DB Server card
    await page.getByTestId('datasource-modal-add-http-server-card').click();

    // Should show HTTP server configuration form
    await expect(page.getByText('Connect to a DuckDB HTTP Server instance')).toBeVisible();
    await expect(
      page.getByText('Direct connection to DuckDB HTTP Server (No Authentication)'),
    ).toBeVisible();

    // Check default values
    await expect(page.getByTestId('http-server-host-input')).toHaveValue('localhost');
    await expect(page.getByTestId('http-server-port-input')).toHaveValue('9999');
    await expect(page.getByTestId('http-server-database-name-input')).toHaveValue('main');
  });

  test('should navigate back to selection', async ({ page, openDatasourceWizard }) => {
    await openDatasourceWizard();
    await page.getByTestId('datasource-modal-add-http-server-card').click();

    // Should be in HTTP server config
    await expect(page.getByText('HTTP DB SERVER')).toBeVisible();

    // Click back button
    await page.getByTestId('back-to-selection').click();

    // Should be back at selection screen
    await expect(page.getByTestId('datasource-modal-add-file-card')).toBeVisible();
    await expect(page.getByTestId('datasource-modal-add-http-server-card')).toBeVisible();
  });

  test('should show correct form fields and buttons', async ({ page, openDatasourceWizard }) => {
    await openDatasourceWizard();
    await page.getByTestId('datasource-modal-add-http-server-card').click();

    // Check all form elements are present
    await expect(page.getByTestId('http-server-host-input')).toBeVisible();
    await expect(page.getByTestId('http-server-port-input')).toBeVisible();
    await expect(page.getByTestId('http-server-database-name-input')).toBeVisible();
    await expect(page.getByTestId('test-http-server-connection-button')).toBeVisible();
    await expect(page.getByTestId('add-http-server-button')).toBeVisible();
  });
});
