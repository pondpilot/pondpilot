/* eslint-disable local-rules/no-playwright-page-methods */
import { setOnboardingShown, waitForAppReady } from '../utils';
import { test as base } from './base';

type PageFixtures = {
  reloadPage: () => Promise<void>;
};

export const test = base.extend<PageFixtures>({
  page: async ({ page }, use) => {
    // ---------- BEFORE EACH TEST ----------

    // Set up File Access API mocks before loading the app
    await page.evaluate(() => {
      // Mock the File Access API to enable app initialization
      if (!('showOpenFilePicker' in window)) {
        Object.defineProperty(window, 'showOpenFilePicker', {
          value: async () => [],
          writable: true,
          configurable: true,
        });
      }
      if (!('showDirectoryPicker' in window)) {
        Object.defineProperty(window, 'showDirectoryPicker', {
          value: async () => ({}),
          writable: true,
          configurable: true,
        });
      }
    });

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
