import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    // ---------- BEFORE EACH TEST ----------
    await page.goto('http://localhost:5173/');
    await page.locator('[data-app-status="ready"]').waitFor({ state: 'attached' });
    await use(page);
  },
});
