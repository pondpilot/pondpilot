import { expect } from '@playwright/test';

import { test } from '../fixtures/base';

test.describe('Tab Take Over Feature', () => {
  test('should show Take Over button on blocked tab', async ({ context }) => {
    // Open first tab
    const page1 = await context.newPage();
    await page1.goto('/');

    // Wait for the app to fully load
    await page1.waitForLoadState('domcontentloaded');

    // Verify first tab is not blocked
    await expect(page1.getByTestId('multiple-tabs-blocked')).toBeHidden();

    // Open second tab (will be blocked)
    const page2 = await context.newPage();
    await page2.goto('/');
    await page2.waitForLoadState('domcontentloaded');

    // Verify blocked state on second tab
    await expect(page2.getByTestId('multiple-tabs-blocked')).toBeVisible();
    await expect(page2.getByTestId('take-over-button')).toBeVisible();
  });

  test('should transfer active state when Take Over is clicked', async ({ context }) => {
    // Open first tab
    const page1 = await context.newPage();
    await page1.goto('/');
    await page1.waitForLoadState('domcontentloaded');

    // First tab should not be blocked initially
    await expect(page1.getByTestId('multiple-tabs-blocked')).toBeHidden();

    // Open second tab
    const page2 = await context.newPage();
    await page2.goto('/');
    await page2.waitForLoadState('domcontentloaded');

    // Second tab should be blocked
    await expect(page2.getByTestId('multiple-tabs-blocked')).toBeVisible();

    // Click Take Over on second tab
    await page2.getByTestId('take-over-button').click();

    // Second tab should now be active (not blocked)
    await expect(page2.getByTestId('multiple-tabs-blocked')).toBeHidden();

    // First tab should now be blocked
    await expect(page1.getByTestId('multiple-tabs-blocked')).toBeVisible();
  });

  test('should allow multiple takeovers back and forth', async ({ context }) => {
    // Open first tab
    const page1 = await context.newPage();
    await page1.goto('/');
    await page1.waitForLoadState('domcontentloaded');

    // Open second tab
    const page2 = await context.newPage();
    await page2.goto('/');
    await page2.waitForLoadState('domcontentloaded');

    // Second tab takes over
    await page2.getByTestId('take-over-button').click();
    await expect(page2.getByTestId('multiple-tabs-blocked')).toBeHidden();
    await expect(page1.getByTestId('multiple-tabs-blocked')).toBeVisible();

    // First tab takes over back
    await page1.getByTestId('take-over-button').click();
    await expect(page1.getByTestId('multiple-tabs-blocked')).toBeHidden();
    await expect(page2.getByTestId('multiple-tabs-blocked')).toBeVisible();
  });
});
