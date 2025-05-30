/* eslint-disable no-playwright-page-methods */
import { expect, mergeTests, devices } from '@playwright/test';

import { test as baseTest } from '../fixtures/base';
import { waitForAppReady } from '../utils';

const test = mergeTests(baseTest);

const mobileDevices = [{ name: 'iPhone 15 Pro' }, { name: 'iPad Pro 11' }, { name: 'Pixel 7' }];

mobileDevices.forEach(({ name }) => {
  test(`${name} device`, async ({ browser }) => {
    const mobileContext = await browser.newContext({ ...devices[name] });
    const page = await mobileContext.newPage();
    await page.goto('/');

    // Check desktop only is attached
    await expect(page.getByTestId('desktop-only')).toBeAttached();

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 800 });

    // Check desktop only is not attached
    await expect(page.getByTestId('desktop-only')).toBeAttached();
  });
});

test('Desktop device', async ({ page }) => {
  await page.goto('/');
  await waitForAppReady(page);

  // Check desktop only is not attached
  await expect(page.getByTestId('desktop-only')).not.toBeAttached();

  // Set viewport to mobile size
  await page.setViewportSize({ width: 400, height: 600 });

  // Check desktop only is not attached
  await expect(page.getByTestId('desktop-only')).not.toBeAttached();
});
