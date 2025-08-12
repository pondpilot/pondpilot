import { Page } from '@playwright/test';

export async function setupApp(page: Page) {
  // Add any app-specific setup here
  await page.goto('http://localhost:5173');
  // Wait for app to load
  await page.waitForLoadState('networkidle');
}

export async function teardownApp(page: Page) {
  // Add any cleanup here if needed
  // For now, just close the page
  await page.close();
}
