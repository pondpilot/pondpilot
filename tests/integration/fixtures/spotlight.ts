import { test as base, expect, Locator } from '@playwright/test';

type SpotlightFixtures = {
  openSpotlight: () => Promise<Locator>;
  createScriptViaSpotlight: () => Promise<void>;
  openSettingsViaSpotlight: () => Promise<void>;
  addDirectoryViaSpotlight: () => Promise<void>;
};

export const test = base.extend<SpotlightFixtures>({
  openSpotlight: async ({ page }, use) => {
    const spotlightRoot = page.getByTestId('spotlight-menu');

    await use(async () => {
      // Verify spotlight is not visible
      await expect(spotlightRoot).toBeHidden();

      // Open spotlight menu using trigger
      await page.getByTestId('spotlight-trigger-input').click();

      // Verify spotlight is visible
      await expect(spotlightRoot).toBeVisible();

      return spotlightRoot;
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
});
