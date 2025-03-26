import { test as base, expect, Locator } from '@playwright/test';

type SpotlightFixtures = {
  openSpotlight: () => Promise<Locator>;
  createQueryViaSpotlight: () => Promise<void>;
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

  createQueryViaSpotlight: async ({ openSpotlight }, use) => {
    await use(async () => {
      const spotlightRoot = await openSpotlight();

      // Create new query through spotlight
      await spotlightRoot.getByTestId('spotlight-action-create-new-query').click();

      // Verify spotlight is closed after creating query
      await expect(spotlightRoot).not.toBeVisible();
    });
  },
});
