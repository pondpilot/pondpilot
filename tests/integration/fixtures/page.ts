import { test as base, Page } from '@playwright/test';

const waitForAppReady = async (page: Page) => {
  // Wait for the app to be ready
  await page.locator('[data-app-status="ready"]').waitFor({ state: 'attached' });
};

type PageFixtures = {
  reloadPage: () => Promise<void>;
};

export const test = base.extend<PageFixtures>({
  page: async ({ page }, use) => {
    // ---------- BEFORE EACH TEST ----------
    await page.goto('http://localhost:5173/');
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
