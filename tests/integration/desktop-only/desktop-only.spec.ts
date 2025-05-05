import { expect, mergeTests } from '@playwright/test';

import { test as baseTest } from '../fixtures/page';

const test = mergeTests(baseTest);

test('Desktop only', async ({ page }) => {
  // Check desktop only is not attached
  await expect(page.getByTestId('desktop-only')).toBeHidden();

  // Set viewport size to mobile
  await page.setViewportSize({ width: 991, height: 800 });

  // Check desktop only is attached
  await expect(page.getByTestId('desktop-only')).toBeVisible();

  // Set viewport size to desktop
  await page.setViewportSize({ width: 992, height: 800 });

  // Check desktop only is not attached
  await expect(page.getByTestId('desktop-only')).toBeHidden();
});
