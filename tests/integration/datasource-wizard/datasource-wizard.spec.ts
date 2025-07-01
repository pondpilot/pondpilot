import { expect, mergeTests } from '@playwright/test';

import { test as notificationsTest } from '../fixtures/notifications';
import { test as baseTest } from '../fixtures/page';
import { test as spotlightTest } from '../fixtures/spotlight';

const test = mergeTests(baseTest, spotlightTest, notificationsTest);

test.describe('Datasource Wizard', () => {
  test('should open datasource wizard modal from navbar', async ({ page }) => {
    // Click the + button in the navbar
    await page.locator('[data-testid="navbar-add-datasource-button"]').click();

    // Verify modal is open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add Data Source' })).toBeVisible();

    // Verify all three options are present
    await expect(page.getByText('Add Files')).toBeVisible();
    await expect(page.getByText('Add Folder')).toBeVisible();
    await expect(page.getByText('Remote Database')).toBeVisible();
  });

  test('should open datasource wizard from spotlight', async ({ page, openSpotlight }) => {
    await openSpotlight({ trigger: 'click' });
    await page.getByPlaceholder('Search for actions and commands...').fill('add remote');

    // Click on the "Add Remote Database" option
    await page.getByText('Add Remote Database').click();

    // Should navigate directly to remote database config
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add Remote Database' })).toBeVisible();
    await expect(page.getByLabel('Database URL')).toBeVisible();
  });

  test('should navigate between wizard steps', async ({ page }) => {
    // Open wizard
    await page.locator('[data-testid="navbar-add-datasource-button"]').click();

    // Click on Remote Database
    await page.getByText('Remote Database').click();

    // Should show remote database config
    await expect(page.getByLabel('Database URL')).toBeVisible();
    await expect(page.getByLabel('Database Name')).toBeVisible();

    // Click back button
    await page.getByRole('button', { name: 'Back' }).click();

    // Should be back at selection screen
    await expect(page.getByText('Add Files')).toBeVisible();
    await expect(page.getByText('Add Folder')).toBeVisible();
    await expect(page.getByText('Remote Database')).toBeVisible();
  });

  test('should validate remote database URL', async ({ page, expectErrorNotification }) => {
    // Navigate to remote database config
    await page.locator('[data-testid="navbar-add-datasource-button"]').click();
    await page.getByText('Remote Database').click();

    // Try to test with invalid URL
    await page.getByLabel('Database URL').fill('invalid-url');
    await page.getByLabel('Database Name').fill('test_db');
    await page.getByRole('button', { name: 'Test Connection' }).click();

    // Should show error
    await expectErrorNotification('Please enter a valid URL');

    // Try with valid but unsupported protocol
    await page.getByLabel('Database URL').fill('ftp://example.com/data.parquet');
    await page.getByRole('button', { name: 'Test Connection' }).click();

    // Should show error about protocol
    await expectErrorNotification(/not allowed/);
  });

  test('should validate database name', async ({ page, expectErrorNotification }) => {
    // Navigate to remote database config
    await page.locator('[data-testid="navbar-add-datasource-button"]').click();
    await page.getByText('Remote Database').click();

    // Try to test without database name
    await page.getByLabel('Database URL').fill('https://example.com/data.parquet');
    await page.getByLabel('Database Name').clear();
    await page.getByRole('button', { name: 'Test Connection' }).click();

    // Should show error
    await expectErrorNotification('Database name is required');
  });

  test('should disable buttons during connection test', async ({ page }) => {
    // Navigate to remote database config
    await page.locator('[data-testid="navbar-add-datasource-button"]').click();
    await page.getByText('Remote Database').click();

    // Fill in valid looking data
    await page.getByLabel('Database URL').fill('https://example.com/test.parquet');
    await page.getByLabel('Database Name').fill('test_db');

    // Click test - buttons should be disabled
    const testButton = page.getByRole('button', { name: 'Test Connection' });
    const addButton = page.getByRole('button', { name: 'Add Database' });

    // Store the promise before clicking
    const responsePromise = page
      .waitForResponse((response: any) => response.url().includes('example.com'), { timeout: 5000 })
      .catch(() => null); // Catch timeout as connection will fail

    await testButton.click();

    // Both buttons should be disabled during test
    await expect(testButton).toBeDisabled();
    await expect(addButton).toBeDisabled();

    // Wait for the test to complete (it will fail since the URL is fake)
    await responsePromise;

    // Buttons should be enabled again after test completes
    await expect(testButton).toBeEnabled();
    await expect(addButton).toBeEnabled();
  });

  test('should handle read-only checkbox', async ({ page }) => {
    // Navigate to remote database config
    await page.locator('[data-testid="navbar-add-datasource-button"]').click();
    await page.getByText('Remote Database').click();

    // Read-only should be checked by default
    const readOnlyCheckbox = page.getByLabel('Read-only access');
    await expect(readOnlyCheckbox).toBeChecked();

    // Uncheck it
    await readOnlyCheckbox.uncheck();
    await expect(readOnlyCheckbox).not.toBeChecked();

    // Check it again
    await readOnlyCheckbox.check();
    await expect(readOnlyCheckbox).toBeChecked();
  });

  test('should close modal on cancel', async ({ page }) => {
    // Open wizard
    await page.locator('[data-testid="navbar-add-datasource-button"]').click();

    // Modal should be visible
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click close button (X)
    await page.getByLabel('Close').click();

    // Modal should be gone
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('should close modal on escape key', async ({ page }) => {
    // Open wizard
    await page.locator('[data-testid="navbar-add-datasource-button"]').click();

    // Modal should be visible
    await expect(page.getByRole('dialog')).toBeVisible();

    // Press escape
    await page.keyboard.press('Escape');

    // Modal should be gone
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('should show supported protocols in info alert', async ({ page }) => {
    // Navigate to remote database config
    await page.locator('[data-testid="navbar-add-datasource-button"]').click();
    await page.getByText('Remote Database').click();

    // Check that the info alert shows supported protocols
    const infoAlert = page.getByRole('alert');
    await expect(infoAlert).toBeVisible();
    await expect(infoAlert).toContainText('Supported URL types');
    await expect(infoAlert).toContainText('HTTPS');
    await expect(infoAlert).toContainText('S3');
    await expect(infoAlert).toContainText('Google Cloud Storage');
    await expect(infoAlert).toContainText('Azure Blob Storage');
  });

  // TODO: Add tests for file and folder selection once file picker mocking is set up
});
