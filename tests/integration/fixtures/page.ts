import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    // ---------- BEFORE EACH TEST ----------
    await page.goto('/');

    const appStatus = page.getByTestId('app-status');
    await expect(appStatus).toHaveAttribute('data-app-status', 'ready');

    await use(page);
  },
});
