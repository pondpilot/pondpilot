import { LOCAL_STORAGE_KEYS } from '@consts/local-storage';
import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ browser }, use) => {
    const context = await browser.newContext();

    // Set up the local storage to avoid showing the onboarding modal
    const setupPage = await context.newPage();
    await setupPage.goto('http://localhost:5173/');
    await setupPage.evaluate(
      (key) => localStorage.setItem(key, 'true'),
      LOCAL_STORAGE_KEYS.ONBOARDING_SHOWN,
    );
    await setupPage.close();

    const page = await context.newPage();
    await page.goto('http://localhost:5173/');
    await page.locator('[data-app-status="ready"]').waitFor({ state: 'attached' });

    await use(page);

    await context.close();
  },
});
