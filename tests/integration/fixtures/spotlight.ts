import { test as base, expect, Locator } from '@playwright/test';

type SpotlightFixtures = {
  spotlight: Locator;
  openSpotlight: () => Promise<Locator>;
  createScriptViaSpotlight: () => Promise<void>;
  openSettingsViaSpotlight: () => Promise<void>;
  addDirectoryViaSpotlight: () => Promise<void>;
  openImportSharedScriptModalViaSpotlight: () => Promise<void>;
};

export const test = base.extend<SpotlightFixtures>({
  spotlight: async ({ page }, use) => {
    await use(page.getByTestId('spotlight-menu'));
  },

  openSpotlight: async ({ page, spotlight }, use) => {
    await use(async () => {
      // Verify spotlight is not visible
      await expect(spotlight).toBeHidden();

      // Open spotlight menu using trigger
      await page.getByTestId('spotlight-trigger-input').click();

      // Verify spotlight is visible
      await expect(spotlight).toBeVisible();

      return spotlight;
    });
  },

  createScriptViaSpotlight: async ({ openSpotlight }, use) => {
    await use(async () => {
      const spotlightRoot = await openSpotlight();

      // Create new query through spotlight
      await spotlightRoot.getByTestId('spotlight-action-create-new-script').click();

      // Verify spotlight is closed after creating query
      await expect(spotlightRoot).toBeHidden();
    });
  },

  openSettingsViaSpotlight: async ({ openSpotlight }, use) => {
    await use(async () => {
      const spotlightRoot = await openSpotlight();

      // Open settings through spotlight
      await spotlightRoot.getByTestId('spotlight-action-settings').click();

      // Verify spotlight is closed after opening settings
      await expect(spotlightRoot).toBeHidden();
    });
  },

  addDirectoryViaSpotlight: async ({ openSpotlight }, use) => {
    await use(async () => {
      const spotlightRoot = await openSpotlight();

      // Add folder through spotlight
      await spotlightRoot.getByTestId('spotlight-action-add-folder').click();

      // Verify spotlight is closed after adding directory
      await expect(spotlightRoot).toBeHidden();
    });
  },

  openImportSharedScriptModalViaSpotlight: async ({ openSpotlight }, use) => {
    await use(async () => {
      const spotlightRoot = await openSpotlight();

      // Share script through spotlight
      await spotlightRoot.getByTestId('spotlight-action-import-script-from-url').click();

      // Verify spotlight is closed after sharing script
      await expect(spotlightRoot).toBeHidden();
    });
  },
});
