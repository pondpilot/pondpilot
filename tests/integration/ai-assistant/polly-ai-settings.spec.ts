import { expect, mergeTests } from '@playwright/test';

import { test as baseTest } from '../fixtures/page';
import { test as settingsTest } from '../fixtures/settings';

const test = mergeTests(baseTest, settingsTest);

test.describe('Polly AI Settings Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure fresh state for each test
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test.describe('Polly Demo Banner', () => {
    test('should show demo banner on first visit to settings with Polly selected', async ({
      openSettings,
    }) => {
      const settingsPage = await openSettings();

      // Wait for settings content to load by checking for provider label
      await expect(settingsPage.getByText('AI Provider')).toBeVisible({ timeout: 10000 });

      // Demo banner should be visible (contains "Welcome to Polly AI")
      const demoBanner = settingsPage.getByText('Welcome to Polly AI');
      await expect(demoBanner).toBeVisible();
    });

    test('should dismiss demo banner permanently', async ({ page, openSettings }) => {
      const settingsPage = await openSettings();

      // Wait for settings content to load
      await expect(settingsPage.getByText('AI Provider')).toBeVisible({ timeout: 10000 });

      // Wait for demo banner
      const demoBanner = settingsPage.getByText('Welcome to Polly AI');
      await expect(demoBanner).toBeVisible();

      // Click Continue with Polly button to dismiss
      const continueButton = settingsPage.getByRole('button', { name: /Continue with Polly/i });
      await continueButton.click();

      // Banner should disappear
      await expect(demoBanner).toBeHidden();

      // Close settings
      await settingsPage.getByTestId('settings-page-close-button').click();
      await expect(settingsPage).not.toBeAttached();

      // Reopen settings
      await page.getByTestId('settings-button').click();
      await expect(settingsPage).toBeVisible();

      // Wait for settings to load
      await expect(settingsPage.getByText('AI Provider')).toBeVisible({ timeout: 10000 });

      // Banner should not reappear (dismissed permanently)
      await expect(demoBanner).not.toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('Polly AI Provider', () => {
    test('Polly should be the default provider', async ({ openSettings }) => {
      const settingsPage = await openSettings();

      // Wait for settings to load
      await expect(settingsPage.getByText('AI Provider')).toBeVisible({ timeout: 10000 });

      // The Polly AI label should be visible as the selected provider
      // Mantine Select shows the selected value in an input
      const pollySelected = settingsPage.locator('input[value="Polly AI"]');
      await expect(pollySelected).toBeVisible({ timeout: 5000 });
    });

    test('should show built-in info instead of API key input for Polly', async ({
      openSettings,
    }) => {
      const settingsPage = await openSettings();

      // Wait for settings to load
      await expect(settingsPage.getByText('AI Provider')).toBeVisible({ timeout: 10000 });

      // Dismiss banner if visible
      const continueButton = settingsPage.getByRole('button', { name: /Continue with Polly/i });
      if (await continueButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await continueButton.click();
      }

      // Should show the built-in info alert
      const pollyInfo = settingsPage.getByText(
        /PondPilot's built-in AI assistant.*No configuration required/,
      );
      await expect(pollyInfo).toBeVisible();

      // API key label should NOT be visible for Polly
      const apiKeyLabel = settingsPage.getByText('API Key', { exact: true });
      await expect(apiKeyLabel).toBeHidden();
    });

    test('should show Polly AI: Built-in badge in API key status', async ({ openSettings }) => {
      const settingsPage = await openSettings();

      // Wait for settings to load
      await expect(settingsPage.getByText('AI Provider')).toBeVisible({ timeout: 10000 });

      // Find the API key status section
      const pollyBadge = settingsPage.getByText('Polly AI: Built-in');
      await expect(pollyBadge).toBeVisible();
    });

    test('should show privacy notice for Polly mentioning PondPilot servers', async ({
      openSettings,
    }) => {
      const settingsPage = await openSettings();

      // Wait for settings to load
      await expect(settingsPage.getByText('AI Provider')).toBeVisible({ timeout: 10000 });

      // Find privacy notice mentioning PondPilot's servers
      const privacyNotice = settingsPage.getByText(/PondPilot's servers/);
      await expect(privacyNotice).toBeVisible();

      // Also check for Claude mention
      const claudeMention = settingsPage.getByText(/Polly uses Claude under the hood/);
      await expect(claudeMention).toBeVisible();
    });
  });

  test.describe('Test Connection', () => {
    test('Connection button should be enabled for Polly without API key', async ({
      openSettings,
    }) => {
      const settingsPage = await openSettings();

      // Wait for settings to load
      await expect(settingsPage.getByText('AI Provider')).toBeVisible({ timeout: 10000 });

      // Dismiss welcome banner if visible
      const continueButton = settingsPage.getByRole('button', { name: /Continue with Polly/i });
      if (await continueButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await continueButton.click();
      }

      // Find Test Connection button
      const testButton = settingsPage.getByRole('button', { name: /Test Connection/i });
      await expect(testButton).toBeVisible();
      await expect(testButton).toBeEnabled();
    });
  });
});
