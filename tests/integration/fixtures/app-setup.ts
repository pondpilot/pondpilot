import { Page } from '@playwright/test';

export async function setupApp(page: Page) {
  // App is automatically opened by the custom page fixture
  // Wait for app to load
  await page.waitForLoadState('domcontentloaded');
}

export async function teardownApp(page: Page) {
  // Add any cleanup here if needed
  // For now, just close the page
  await page.close();
}
