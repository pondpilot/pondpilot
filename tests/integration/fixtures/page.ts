import { LOCAL_STORAGE_KEYS } from '@consts/local-storage';
import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.goto('http://localhost:5173/');

    await page.evaluate(
      (key) => localStorage.setItem(key, 'true'),
      LOCAL_STORAGE_KEYS.ONBOARDING_SHOWN,
    );

    await page.reload();

    await page.locator('[data-app-status="ready"]').waitFor({ state: 'attached' });

    await use(page);
  },
});
