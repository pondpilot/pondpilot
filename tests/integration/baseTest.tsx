import { test as base } from '@playwright/test';

export const baseTest = base.extend({
  page: async ({ page }, use) => {
    // ---------- BEFORE EACH TEST ----------
    await page.goto('http://localhost:5173/');
    await page.waitForSelector('[data-app-ready="true"]', { state: 'attached' });

    await use(page);
  },
});
