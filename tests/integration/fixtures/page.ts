import { test as base, expect, Page } from '@playwright/test';

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
