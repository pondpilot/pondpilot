import { LOCAL_STORAGE_KEYS } from '@models/local-storage';
import { expect, Page } from '@playwright/test';
import { test as base } from './base';

const waitForAppReady = async (page: Page) => {
  // Wait for the app to be ready
  const appStatus = page.getByTestId('app-state');
  await expect(appStatus).toHaveAttribute('data-app-load-state', 'ready');
};

type PageFixtures = {
  reloadPage: () => Promise<void>;
};

export const test = base.extend<PageFixtures>({
  page: async ({ page }, use) => {
    // ---------- BEFORE EACH TEST ----------

    // Set local storage before navigating to the page
    await page.context().addInitScript((key) => {
      window.localStorage.setItem(key, 'true');
    }, LOCAL_STORAGE_KEYS.ONBOARDING_SHOWN);

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
