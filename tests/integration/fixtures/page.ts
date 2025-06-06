/* eslint-disable local-rules/no-playwright-page-methods */
import { setOnboardingShown, waitForAppReady } from '../utils';
import { test as base } from './base';

type PageFixtures = {
  reloadPage: () => Promise<void>;
};

export const test = base.extend<PageFixtures>({
  page: async ({ page }, use) => {
    // ---------- BEFORE EACH TEST ----------

    // Set local storage before navigating to the page
    await setOnboardingShown(page);

    // Navigate to page with localStorage already set
    await page.goto('/');

    await waitForAppReady(page);

    await use(page);
  },
  reloadPage: async ({ page }, use) => {
    await use(async () => {
      await page.reload();
      await waitForAppReady(page);
    });
  },
});
