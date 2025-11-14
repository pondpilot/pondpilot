import { expect, mergeTests, Page, Locator } from '@playwright/test';

import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as notificationsTest } from '../fixtures/notifications';
import { test as baseTest } from '../fixtures/page';
import { test as spotlightTest } from '../fixtures/spotlight';

const test = mergeTests(baseTest, spotlightTest, notificationsTest, fileSystemExplorerTest);

const getWizardCard = (page: Page, primaryId: string, fallbackId: string): Locator => {
  return page.locator(`[data-testid="${primaryId}"], [data-testid="${fallbackId}"]`);
};

test.describe('Datasource Wizard', () => {
  test('should navigate between wizard steps', async ({ page, openDatasourceWizard }) => {
    // Open wizard
    await openDatasourceWizard();

    // Click on Remote Database
    // await page.getByTestId('add-remote-database-card')
    const remoteDatabaseCard = getWizardCard(
      page,
      'add-remote-database-card',
      'datasource-modal-add-remote-database-card',
    );
    await remoteDatabaseCard.click();

    // Should show remote database config
    await expect(page.getByText('Connect to a remote database using a URL')).toBeVisible();

    // Click back button
    await page.getByTestId('back-to-selection').click();

    // Should be back at selection screen
    await expect(
      getWizardCard(page, 'add-file-card', 'datasource-modal-add-file-card'),
    ).toBeVisible();
  });

  // eslint-disable-next-line playwright/expect-expect
  test('should validate remote database URL', async ({
    page,
    openDatasourceWizard,
    waitForNotification,
  }) => {
    // Navigate to remote database config
    await openDatasourceWizard();

    const remoteDBCard = getWizardCard(
      page,
      'add-remote-database-card',
      'datasource-modal-add-remote-database-card',
    );
    const remoteDBURLInput = page.getByTestId('remote-database-url-input');
    const remoteDBNameInput = page.getByTestId('remote-database-name-input');
    const testConnectionButton = page.getByTestId('test-remote-database-connection-button');

    await remoteDBCard.click();

    // Try to test with invalid URL
    await remoteDBURLInput.fill('invalid-url');
    await remoteDBNameInput.fill('test_db');
    await testConnectionButton.click();

    // Should show error
    await waitForNotification('Invalid URL');
  });

  test('should validate database name', async ({ page, openDatasourceWizard }) => {
    // Navigate to remote database config
    await openDatasourceWizard();
    const remoteDBCard = getWizardCard(
      page,
      'add-remote-database-card',
      'datasource-modal-add-remote-database-card',
    );
    const remoteDBURLInput = page.getByTestId('remote-database-url-input');
    const remoteDBNameInput = page.getByTestId('remote-database-name-input');
    const testConnectionButton = page.getByTestId('test-remote-database-connection-button');
    await remoteDBCard.click();

    // Try to test without database name
    await remoteDBURLInput.fill('https://example.com/data.parquet');
    await remoteDBNameInput.clear();
    const disabled = testConnectionButton;
    await expect(disabled).toBeDisabled();
  });

  test.skip('should disable buttons during connection test', async ({
    page,
    openDatasourceWizard,
  }) => {
    // Navigate to remote database config
    await openDatasourceWizard();
    const remoteDBCard = getWizardCard(
      page,
      'add-remote-database-card',
      'datasource-modal-add-remote-database-card',
    );
    const remoteDBURLInput = page.getByTestId('remote-database-url-input');
    const remoteDBNameInput = page.getByTestId('remote-database-name-input');
    const testConnectionButton = page.getByTestId('test-remote-database-connection-button');
    const addRemoteDatabaseButton = page.getByTestId('add-remote-database-button');
    await remoteDBCard.click();

    // Fill in valid looking data
    await remoteDBURLInput.fill('https://example.com/test.parquet');
    await remoteDBNameInput.fill('test_db');

    // Store the promise before clicking
    const responsePromise = page
      .waitForResponse((response: any) => response.url().includes('example.com'), { timeout: 5000 })
      .catch(() => null); // Catch timeout as connection will fail

    await testConnectionButton.click();

    // Both buttons should be disabled during test
    await expect(testConnectionButton).toBeDisabled();
    await expect(addRemoteDatabaseButton).toBeDisabled();

    // Wait for the test to complete (it will fail since the URL is fake)
    await responsePromise;

    // Buttons should be enabled again after test completes
    await expect(testConnectionButton).toBeEnabled();
    await expect(addRemoteDatabaseButton).toBeEnabled();
  });
});
