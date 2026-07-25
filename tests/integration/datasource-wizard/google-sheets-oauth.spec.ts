import { expect, mergeTests } from '@playwright/test';

import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as baseTest } from '../fixtures/page';

const test = mergeTests(baseTest, fileSystemExplorerTest);

test('Google OAuth relay survives the COOP cross-origin transition', async ({
  context,
  page,
  openDatasourceWizard,
  reloadPage,
}) => {
  await context.route('http://localhost:6173/**', async (route) => {
    if (route.request().resourceType() !== 'document') {
      await route.fallback();
      return;
    }

    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'cross-origin-embedder-policy': 'credentialless',
        'cross-origin-opener-policy': 'same-origin',
      },
    });
  });
  await context.route('https://accounts.google.com/o/oauth2/v2/auth**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Mock Google OAuth</title><p>Google consent screen</p>',
    });
  });

  await page.evaluate(() => {
    localStorage.setItem('GOOGLE_OAUTH_CLIENT_ID', 'browser-test.apps.googleusercontent.com');
  });
  await reloadPage();
  await expect(page.evaluate(() => crossOriginIsolated)).resolves.toBe(true);

  await openDatasourceWizard();
  await page.getByTestId('datasource-modal-add-google-sheet-card').click();
  await page.getByLabel('Google Sign-In').check();

  const signInButton = page.getByRole('button', { name: 'Sign in with Google' });
  const popupPromise = context.waitForEvent('page');
  await signInButton.click();
  const popup = await popupPromise;
  await popup.waitForURL(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);

  const state = new URL(popup.url()).searchParams.get('state');
  expect(state).toBeTruthy();

  // COOP severs the opener's WindowProxy here. The request must remain active
  // until the state-bound callback returns instead of reporting cancellation.
  await expect(signInButton).toBeDisabled();
  await expect(page.getByText('Google sign-in was cancelled')).toBeHidden();

  const callbackUrl = new URL('/google-oauth-callback.html', page.url());
  callbackUrl.hash = new URLSearchParams({
    access_token: 'ya29.browser-test',
    expires_in: '3600',
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    state: state!,
  }).toString();
  void popup.goto(callbackUrl.toString()).catch(() => {
    // The callback closes its own popup immediately after broadcasting.
  });

  await expect(page.getByText('Authenticated')).toBeVisible();
});
