import { test, expect } from '@playwright/test';

import { setupApp, teardownApp } from './fixtures/app-setup';

const isDesktopTestRun = process.env.TAURI_TESTS === 'true';

test.describe('Secrets Management', () => {
  test.skip(!isDesktopTestRun, 'Secrets management is only available in the desktop app.');

  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test.afterEach(async ({ page }) => {
    await teardownApp(page);
  });

  test('should load secrets management page', async ({ page }) => {
    // Navigate to secrets management (you'll need to add this route to your app)
    // App is automatically opened, just navigate to secrets route
    await page.evaluate(() => {
      window.location.hash = '#/secrets';
    });
    await page.waitForURL('**/secrets');

    // Check that the page loads
    await expect(page.locator('text=Secrets Management')).toBeVisible();
    await expect(page.locator('text=Manage your database credentials')).toBeVisible();
  });

  test('should open add secret modal', async ({ page }) => {
    // App is automatically opened, just navigate to secrets route
    await page.evaluate(() => {
      window.location.hash = '#/secrets';
    });
    await page.waitForURL('**/secrets');

    // Click add secret button
    await page.click('button:has-text("Add Secret")');

    // Check that modal opens
    await expect(page.locator('text=Add Secret').nth(1)).toBeVisible();
    await expect(page.locator('label:has-text("Secret Type")')).toBeVisible();
  });

  test('should create a new S3 secret', async ({ page }) => {
    // App is automatically opened, just navigate to secrets route
    await page.evaluate(() => {
      window.location.hash = '#/secrets';
    });
    await page.waitForURL('**/secrets');

    // Open add secret modal
    await page.click('button:has-text("Add Secret")');

    // Fill in the form
    await page.selectOption('select', 'S3');
    await page.fill('input[placeholder*="Production S3"]', 'Test S3 Secret');
    await page.fill('textarea', 'Test S3 credentials for integration testing');
    await page.fill('input[placeholder="AKIA..."]', 'AKIAIOSFODNN7EXAMPLE');
    await page.fill('input[type="password"]', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
    await page.fill('input[placeholder="us-east-1"]', 'us-east-1');

    // Add tags
    await page.click('input[placeholder="Enter tags"]');
    await page.keyboard.type('test');
    await page.keyboard.press('Enter');
    await page.keyboard.type('integration');
    await page.keyboard.press('Enter');

    // Save the secret
    await page.click('button:has-text("Save Secret")');

    // Check that the secret appears in the list
    await expect(page.locator('text=Test S3 Secret')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Test S3 credentials')).toBeVisible();
  });

  test('should filter secrets by type', async ({ page }) => {
    // App is automatically opened, just navigate to secrets route
    await page.evaluate(() => {
      window.location.hash = '#/secrets';
    });
    await page.waitForURL('**/secrets');

    // Create an S3 secret first
    await page.click('button:has-text("Add Secret")');
    await page.selectOption('select', 'S3');
    await page.fill('input[placeholder*="Production S3"]', 'S3 Secret');
    await page.fill('input[placeholder="AKIA..."]', 'AKIAIOSFODNN7EXAMPLE');
    await page.fill('input[type="password"]', 'testkey');
    await page.click('button:has-text("Save Secret")');

    // Wait for secret to be saved
    await page.waitForSelector('text=S3 Secret');

    // Create a PostgreSQL secret
    await page.click('button:has-text("Add Secret")');
    await page.selectOption('select', 'Postgres');
    await page.fill('input[placeholder*="Production S3"]', 'Postgres Secret');
    await page.fill('input[placeholder*="localhost"]', 'localhost');
    await page.fill('input[placeholder*="username"]', 'testuser');
    await page.fill('input[type="password"]', 'testpass');
    await page.click('button:has-text("Save Secret")');

    // Wait for second secret
    await page.waitForSelector('text=Postgres Secret');

    // Filter by S3
    await page.click('input[placeholder="Filter by type"]');
    await page.click('text=Amazon S3');

    // Check that only S3 secret is visible
    await expect(page.locator('text=S3 Secret')).toBeVisible();
    await expect(page.locator('text=Postgres Secret')).toBeHidden();
  });

  test('should delete a secret', async ({ page }) => {
    // App is automatically opened, just navigate to secrets route
    await page.evaluate(() => {
      window.location.hash = '#/secrets';
    });
    await page.waitForURL('**/secrets');

    // Create a secret to delete
    await page.click('button:has-text("Add Secret")');
    await page.selectOption('select', 'HTTP');
    await page.fill('input[placeholder*="Production S3"]', 'Secret to Delete');
    await page.fill('input[type="password"]', 'Bearer token123');
    await page.click('button:has-text("Save Secret")');

    // Wait for secret to appear
    await page.waitForSelector('text=Secret to Delete');

    // Delete the secret
    page.on('dialog', (dialog) => dialog.accept()); // Auto-confirm delete
    await page.click('tr:has-text("Secret to Delete") button[aria-label*="Delete"]');

    // Check that secret is removed
    await expect(page.locator('text=Secret to Delete')).not.toBeVisible({ timeout: 10000 });
  });

  test('should search secrets', async ({ page }) => {
    // App is automatically opened, just navigate to secrets route
    await page.evaluate(() => {
      window.location.hash = '#/secrets';
    });
    await page.waitForURL('**/secrets');

    // Create multiple secrets
    for (const name of ['Alpha Secret', 'Beta Secret', 'Gamma Secret']) {
      await page.click('button:has-text("Add Secret")');
      await page.selectOption('select', 'HTTP');
      await page.fill('input[placeholder*="Production S3"]', name);
      await page.fill('input[type="password"]', 'token123');
      await page.click('button:has-text("Save Secret")');
      await page.waitForSelector(`text=${name}`);
    }

    // Search for "Beta"
    await page.fill('input[placeholder="Search secrets..."]', 'Beta');

    // Check that only Beta Secret is visible
    await expect(page.locator('text=Beta Secret')).toBeVisible();
    await expect(page.locator('text=Alpha Secret')).toBeHidden();
    await expect(page.locator('text=Gamma Secret')).toBeHidden();
  });
});
