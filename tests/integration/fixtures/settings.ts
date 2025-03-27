import { test as base, expect, Locator } from '@playwright/test';

type SettingsFixtures = {
  openSettings: () => Promise<Locator>;
};

export const test = base.extend<SettingsFixtures>({
  openSettings: async ({ page }, use) => {
    const settingsPage = page.getByTestId('settings-page');

    await use(async () => {
      // Verify settings page is not attached
      expect(settingsPage).not.toBeAttached;

      // Open settings page
      await page.getByTestId('settings-button').click();

      // Verify settings page is visible
      await expect(settingsPage).toBeVisible();

      return settingsPage;
    });
  },
});
