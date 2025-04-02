import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    // ---------- BEFORE EACH TEST ----------
    await page.goto('/');

    const appState = page.getByTestId('app-state');
    await expect(appState).toHaveAttribute('data-app-load-state', 'ready');

    await use(page);
  },
});
