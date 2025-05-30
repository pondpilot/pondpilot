import { expect } from '@playwright/test';

import { test } from './fixtures/base';

// This test directly navigates to the error-test route to verify error handling
test('Error fallback displays correctly when an error is thrown', async ({ page }) => {
  // Navigate to the error-test route (only available in dev mode)
  // eslint-disable-next-line no-playwright-page-methods
  await page.goto('/error-test');

  await expect(page.getByTestId('error-fallback')).toBeVisible();
});
