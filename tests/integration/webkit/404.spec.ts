import { expect } from '@playwright/test';

import { test } from '../fixtures/base';

// This test does not use our base page fixture, since we want to immitate cold loading
// from the browser
test('Direct landing from unknown path redirects to main page', async ({ page, baseURL }) => {
  // Navigate to a non-existent route
  // eslint-disable-next-line local-rules/no-playwright-page-methods
  await page.goto('/non-existent-route');

  // Wait for redirection to complete
  await page.waitForURL(`${baseURL}/`, { waitUntil: 'commit' });

  expect(page.url()).toBe(`${baseURL}/`);
});
