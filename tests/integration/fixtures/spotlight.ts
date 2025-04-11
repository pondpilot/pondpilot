import { test as base, expect, Locator } from '@playwright/test';

type SpotlightFixtures = {
  spotlight: Locator;
  openSpotlight: () => Promise<Locator>;
  createQueryViaSpotlight: () => Promise<void>;
  openSettingsViaSpotlight: () => Promise<void>;
  addDirectoryViaSpotlight: () => Promise<void>;
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

  createQueryViaSpotlight: async ({ openSpotlight }, use) => {
    await use(async () => {
      const spotlightRoot = await openSpotlight();

      // Create new query through spotlight
      await spotlightRoot.getByTestId('spotlight-action-create-new-query').click();

      // Verify spotlight is closed after creating query
      await expect(spotlightRoot).not.toBeVisible();
    });
  },

  openSettingsViaSpotlight: async ({ openSpotlight }, use) => {
    await use(async () => {
      const spotlightRoot = await openSpotlight();

      // Open settings through spotlight
      await spotlightRoot.getByTestId('spotlight-action-settings').click();

      // Verify spotlight is closed after opening settings
      await expect(spotlightRoot).not.toBeVisible();
    });
  },

  addDirectoryViaSpotlight: async ({ openSpotlight }, use) => {
    await use(async () => {
      const spotlightRoot = await openSpotlight();

      // Add folder through spotlight
      await spotlightRoot.getByTestId('spotlight-action-add-folder').click();

      // Verify spotlight is closed after adding directory
      await expect(spotlightRoot).not.toBeVisible();
    });
  },
});
