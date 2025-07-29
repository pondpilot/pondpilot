/**
 * Comprehensive HTTP Server integration tests
 * Covers configuration, connection, authentication, database management, and data viewing
 */

import { expect, mergeTests } from '@playwright/test';

import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as httpServerTest } from '../fixtures/http-server';
import { test as baseTest } from '../fixtures/page';
import { test as spotlightTest } from '../fixtures/spotlight';
import { clickExplorerTreeNodeMenuItemByName } from '../fixtures/utils/explorer-tree';

const test = mergeTests(baseTest, spotlightTest, httpServerTest, fileSystemExplorerTest);

const HTTPSERVER_EXPLORER_PREFIX = 'data-explorer-httpserver';

test.describe('HTTP Server Integration Tests', () => {
  // ===== CONFIGURATION TESTS =====
  test.describe('Configuration', () => {
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

  // ===== CONNECTION TESTS =====
  test.describe('Connection', () => {
    test('should successfully test connection to HTTP server', async ({
      page,
      openDatasourceWizard,
      setupMockServer,
    }) => {
      // Setup mock server with successful connection
      await setupMockServer({ connectionSuccess: true });

      // Open datasource wizard
      await openDatasourceWizard();

      // Navigate to HTTP server config
      await page.getByTestId('datasource-modal-add-http-server-card').click();

      // Should show HTTP server configuration form
      await expect(page.getByText('Connect to a DuckDB HTTP Server instance')).toBeVisible();

      // Test connection should succeed
      await page.getByTestId('test-http-server-connection-button').click();

      // Should show success message
      await expect(page.getByText('Connection successful')).toBeVisible({ timeout: 10000 });
    });

    test('should show error when connection fails', async ({
      page,
      openDatasourceWizard,
      setupMockServer,
    }) => {
      // Setup mock server with failed connection
      await setupMockServer({ connectionSuccess: false });

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

  // ===== AUTHENTICATION TESTS =====
  test.describe('Authentication', () => {
    test('should successfully authenticate with correct username/password', async ({
      page,
      setupMockServer,
      openDatasourceWizard,
    }) => {
      // Configure mock to require basic auth and accept test credentials
      await setupMockServer({
        requireAuth: true,
        authType: 'basic',
        validCredentials: { username: 'testuser', password: 'testpass' },
      });

      await openDatasourceWizard();

      // Click on HTTP DB Server card
      await page.getByTestId('datasource-modal-add-http-server-card').click();

      // Fill connection details
      await page.getByTestId('http-server-host-input').fill('localhost');
      await page.getByTestId('http-server-port-input').fill('9999');
      await page.getByTestId('http-server-database-name-input').fill('test_basic_auth_db');

      // Select Basic Authentication
      await page.getByTestId('http-server-auth-type-select').click();
      await page.getByText('Basic Authentication (Username/Password)').click();

      // Fill credentials
      await page.getByTestId('http-server-username-input').fill('testuser');
      await page.getByTestId('http-server-password-input').fill('testpass');

      // Test connection
      await page.getByTestId('test-http-server-connection-button').click();

      // Verify success notification
      await expect(page.getByText('Connection successful')).toBeVisible({ timeout: 10000 });

      // Add database
      await page.getByTestId('add-http-server-button').click();

      // Verify database was added successfully
      await expect(page.getByText('Database added')).toBeVisible({ timeout: 10000 });
    });

    test('should show 401 error with incorrect basic auth credentials', async ({
      page,
      setupMockServer,
      openDatasourceWizard,
    }) => {
      // Configure mock to require basic auth but reject wrong credentials
      await setupMockServer({
        requireAuth: true,
        authType: 'basic',
        validCredentials: { username: 'testuser', password: 'testpass' },
      });

      await openDatasourceWizard();

      // Click on HTTP DB Server card
      await page.getByTestId('datasource-modal-add-http-server-card').click();

      // Fill connection details
      await page.getByTestId('http-server-host-input').fill('localhost');
      await page.getByTestId('http-server-port-input').fill('9999');

      // Select Basic Authentication
      await page.getByTestId('http-server-auth-type-select').click();
      await page.getByText('Basic Authentication (Username/Password)').click();

      // Fill wrong credentials
      await page.getByTestId('http-server-username-input').fill('wronguser');
      await page.getByTestId('http-server-password-input').fill('wrongpass');

      // Test connection
      await page.getByTestId('test-http-server-connection-button').click();

      // Verify error notification with 401
      await expect(page.getByText('Connection failed')).toBeVisible({ timeout: 10000 });
    });

    test('should successfully authenticate with correct API token', async ({
      page,
      setupMockServer,
      openDatasourceWizard,
    }) => {
      // Configure mock to require token auth and accept test token
      await setupMockServer({
        requireAuth: true,
        authType: 'token',
        validCredentials: { token: 'test-api-key-12345' },
      });

      await openDatasourceWizard();

      // Click on HTTP DB Server card
      await page.getByTestId('datasource-modal-add-http-server-card').click();

      // Fill connection details
      await page.getByTestId('http-server-host-input').fill('localhost');
      await page.getByTestId('http-server-port-input').fill('9999');
      await page.getByTestId('http-server-database-name-input').fill('test_token_auth_db');

      // Select Token Authentication
      await page.getByTestId('http-server-auth-type-select').click();
      await page.getByText('Token Authentication (API Key)').click();

      // Fill API token
      await page.getByTestId('http-server-token-input').fill('test-api-key-12345');

      // Test connection
      await page.getByTestId('test-http-server-connection-button').click();

      // Verify success notification
      await expect(page.getByText('Connection successful')).toBeVisible({ timeout: 10000 });

      // Add database
      await page.getByTestId('add-http-server-button').click();

      // Verify database was added successfully
      await expect(page.getByText('Database added')).toBeVisible({ timeout: 10000 });
    });

    test('should show 401 error with incorrect token', async ({
      page,
      setupMockServer,
      openDatasourceWizard,
    }) => {
      // Configure mock to require token auth but reject wrong token
      await setupMockServer({
        requireAuth: true,
        authType: 'token',
        validCredentials: { token: 'test-api-key-12345' },
      });

      await openDatasourceWizard();

      // Click on HTTP DB Server card
      await page.getByTestId('datasource-modal-add-http-server-card').click();

      // Fill connection details
      await page.getByTestId('http-server-host-input').fill('localhost');
      await page.getByTestId('http-server-port-input').fill('9999');

      // Select Token Authentication
      await page.getByTestId('http-server-auth-type-select').click();
      await page.getByText('Token Authentication (API Key)').click();

      // Fill wrong token
      await page.getByTestId('http-server-token-input').fill('wrong-api-key');

      // Test connection
      await page.getByTestId('test-http-server-connection-button').click();

      // Verify error notification with 401
      await expect(page.getByText('Connection failed')).toBeVisible({ timeout: 10000 });
    });

    test('should disable test button with missing token', async ({
      page,
      setupMockServer,
      openDatasourceWizard,
    }) => {
      // Configure mock to require token auth
      await setupMockServer({
        requireAuth: true,
        authType: 'token',
        validCredentials: { token: 'test-api-key-12345' },
      });

      await openDatasourceWizard();

      // Click on HTTP DB Server card
      await page.getByTestId('datasource-modal-add-http-server-card').click();

      // Fill connection details
      await page.getByTestId('http-server-host-input').fill('localhost');
      await page.getByTestId('http-server-port-input').fill('9999');

      // Select Token Authentication but don't fill token
      await page.getByTestId('http-server-auth-type-select').click();
      await page.getByText('Token Authentication (API Key)').click();

      // Test connection should be disabled when token is empty
      const testButton = page.getByTestId('test-http-server-connection-button');
      await expect(testButton).toBeDisabled();
    });

    test('should send correct X-API-Key header in requests', async ({
      page,
      setupMockServer,
      openDatasourceWizard,
    }) => {
      // Track requests made to the mock server
      const requestHeaders: Record<string, string>[] = [];

      await setupMockServer({
        requireAuth: true,
        authType: 'token',
        validCredentials: { token: 'test-api-key-12345' },
        onRequest: (headers) => {
          requestHeaders.push(headers);
        },
      });

      await openDatasourceWizard();

      // Click on HTTP DB Server card
      await page.getByTestId('datasource-modal-add-http-server-card').click();

      // Fill connection details
      await page.getByTestId('http-server-host-input').fill('localhost');
      await page.getByTestId('http-server-port-input').fill('9999');
      await page.getByTestId('http-server-database-name-input').fill('test_header_db');

      // Select Token Authentication
      await page.getByTestId('http-server-auth-type-select').click();
      await page.getByText('Token Authentication (API Key)').click();

      // Fill API token
      await page.getByTestId('http-server-token-input').fill('test-api-key-12345');

      // Test connection to trigger request
      await page.getByTestId('test-http-server-connection-button').click();

      // Wait for success
      await expect(page.getByText('Connection successful')).toBeVisible({ timeout: 10000 });

      // Verify that X-API-Key header was sent correctly
      expect(requestHeaders.length).toBeGreaterThan(0);
      const lastRequest = requestHeaders[requestHeaders.length - 1];
      expect(lastRequest['X-API-Key'] || lastRequest['x-api-key']).toBe('test-api-key-12345');
    });
  });

  // ===== DATABASE MANAGEMENT TESTS =====
  test.describe('Database Management', () => {
    test('should successfully add HTTP server database', async ({
      page,
      openDatasourceWizard,
      setupMockServer,
    }) => {
      // Setup mock server with successful connection and sample tables
      await setupMockServer({
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
      setupMockServer,
    }) => {
      // Setup mock server
      await setupMockServer({
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
      setupMockServer,
    }) => {
      // Setup initial mock server with one table
      await setupMockServer({
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
      await setupMockServer({
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
        'Refresh',
      );

      // Wait for refresh notification
      await expect(page.getByText('Successfully refreshed schema')).toBeVisible({
        timeout: 10000,
      });

      // The tree should remain expanded after refresh, so both tables should be visible immediately
      // Both tables should now be visible
      await expect(page.getByText('users')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('orders')).toBeVisible({ timeout: 10000 });
    });
  });

  // ===== DATA VIEWING TESTS =====
  test.describe('Data Viewing', () => {
    test('should view table data from HTTP server', async ({
      page,
      openDatasourceWizard,
      setupMockServer,
    }) => {
      // Setup mock server with sample data
      await setupMockServer({
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
});
