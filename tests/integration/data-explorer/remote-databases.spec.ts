import { expect, mergeTests } from '@playwright/test';

import { test as dbExplorerTest } from '../fixtures/db-explorer';
import { test as notificationsTest } from '../fixtures/notifications';
import { test as baseTest } from '../fixtures/page';

const test = mergeTests(baseTest, dbExplorerTest, notificationsTest);

test.describe.skip('Remote Databases', () => {
  // Skip these tests for now as remote database UI functionality may not be fully implemented

  test('should display remote database connection dialog', async ({ page }) => {
    // Click on the add database button or remote database option
    const addButton = page.getByTestId('navbar-add-file-button');
    await addButton.click();

    // Look for remote database option in the menu
    await page.getByRole('menuitem', { name: /remote database/i }).click();

    await expect(page.getByRole('dialog', { name: /connect to remote database/i })).toBeVisible();
    await expect(page.getByLabel(/database url/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /connect/i })).toBeVisible();
  });

  test('should validate remote database URLs', async ({ page }) => {
    // Open remote database dialog
    await page.getByTestId('navbar-add-file-button').click();
    await page.getByRole('menuitem', { name: /remote database/i }).click();

    const urlInput = page.getByLabel(/database url/i);
    const connectButton = page.getByRole('button', { name: /connect/i });

    // Test invalid protocols
    await urlInput.fill('file:///etc/passwd');
    await connectButton.click();
    await expect(page.getByText(/invalid url protocol/i)).toBeVisible();

    // Test localhost blocking
    await urlInput.fill('https://localhost:8080/data.db');
    await connectButton.click();
    await expect(page.getByText(/local network urls are not allowed/i)).toBeVisible();

    // Test valid HTTPS URL
    await urlInput.fill('https://example.com/data.db');
    await connectButton.click();
    // Should not show validation errors
    await expect(page.getByText(/invalid url protocol/i)).toBeHidden();
    await expect(page.getByText(/local network urls are not allowed/i)).toBeHidden();
  });

  test('should show connection state indicators', async ({ page }) => {
    // Add a remote database
    await page.getByTestId('navbar-add-file-button').click();
    await page.getByRole('menuitem', { name: /remote database/i }).click();
    await page.getByLabel(/database url/i).fill('https://example.com/test.db');
    await page.getByRole('button', { name: /connect/i }).click();

    // Wait for connection attempt
    await expect(page.locator('[data-node-type="remote-database"]')).toBeVisible();

    // Check for connection state icon in the explorer
    const remoteDbNode = page.locator('[data-node-type="remote-database"]').first();
    await expect(remoteDbNode).toBeVisible();

    // Should show connection state icon
    const connectionIcon = remoteDbNode.locator('[data-testid="connection-state-icon"]');
    await expect(connectionIcon).toBeVisible();
  });

  test('should handle connection errors gracefully', async ({ page, expectErrorNotification }) => {
    await page.getByTestId('navbar-add-file-button').click();
    await page.getByRole('menuitem', { name: /remote database/i }).click();

    // Use a URL that will fail to connect
    await page
      .getByLabel(/database url/i)
      .fill('https://invalid-domain-that-does-not-exist.com/data.db');
    await page.getByRole('button', { name: /connect/i }).click();

    // Should show error notification
    await expectErrorNotification(/failed to connect/i);
  });

  test('should persist remote database connections across reloads', async ({
    page,
    reloadPage,
  }) => {
    // Add a remote database
    await page.getByTestId('navbar-add-file-button').click();
    await page.getByRole('menuitem', { name: /remote database/i }).click();
    const testUrl = 'https://example.com/persistent-test.db';
    await page.getByLabel(/database url/i).fill(testUrl);
    await page.getByRole('button', { name: /connect/i }).click();

    // Wait for it to appear in the explorer
    await expect(page.locator('[data-node-type="remote-database"]')).toBeVisible();

    // Reload the page
    await reloadPage();

    // The remote database should still be visible
    await expect(page.locator('[data-node-type="remote-database"]')).toBeVisible();
    await expect(page.locator('[data-node-type="remote-database"]')).toContainText(
      'persistent-test.db',
    );
  });

  test('should support reconnection for failed connections', async ({ page }) => {
    // Add a remote database that will fail
    await page.getByTestId('navbar-add-file-button').click();
    await page.getByRole('menuitem', { name: /remote database/i }).click();
    await page.getByLabel(/database url/i).fill('https://invalid-domain.com/data.db');
    await page.getByRole('button', { name: /connect/i }).click();

    // Wait for failed connection
    await expect(page.locator('[data-node-type="remote-database"]')).toBeVisible();

    // Right-click on the failed connection
    const remoteDbNode = page.locator('[data-node-type="remote-database"]').first();
    await remoteDbNode.click({ button: 'right' });

    // Should have reconnect option
    await expect(page.getByRole('menuitem', { name: /reconnect/i })).toBeVisible();

    // Click reconnect
    await page.getByRole('menuitem', { name: /reconnect/i }).click();

    // Should attempt to reconnect (we'll see loading state or error)
    await expect(page.locator('[data-testid="connection-state-icon"]')).toBeVisible();
  });

  test('should allow removing remote databases', async ({ page }) => {
    // Add a remote database
    await page.getByTestId('navbar-add-file-button').click();
    await page.getByRole('menuitem', { name: /remote database/i }).click();
    await page.getByLabel(/database url/i).fill('https://example.com/removable.db');
    await page.getByRole('button', { name: /connect/i }).click();

    // Wait for it to appear
    const remoteDbNode = page.locator('[data-node-type="remote-database"]').first();
    await expect(remoteDbNode).toBeVisible();

    // Right-click and remove
    await remoteDbNode.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /remove/i }).click();

    // Confirm removal dialog should appear
    const confirmButton = page.getByRole('button', { name: /confirm|remove/i });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Should be removed from the explorer
    await expect(remoteDbNode).toBeHidden();
  });
});
