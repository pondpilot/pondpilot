import { test as base, expect, Locator } from '@playwright/test';

type SettingsFixtures = {
  settingsPage: Locator;
  openSettings: () => Promise<Locator>;
};

export const test = base.extend<SettingsFixtures>({
  settingsPage: async ({ page }, use) => {
    await use(page.getByTestId('settings-page'));
  },

  openSettings: async ({ page, settingsPage }, use) => {
    await use(async () => {
      // Verify settings page is not attached
      await expect(settingsPage).not.toBeAttached();

      // Open settings page
      await page.getByTestId('settings-button').click();

      // Verify settings page is visible
      await expect(settingsPage).toBeVisible();

      return settingsPage;
    });
  },
});
