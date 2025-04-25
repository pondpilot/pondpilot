import { LOCAL_STORAGE_KEYS } from '@models/local-storage';
import { test as base, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const waitForAppReady = async (page: Page) => {
  // Wait for the app to be ready
  const appStatus = page.getByTestId('app-state');
  await expect(appStatus).toHaveAttribute('data-app-load-state', 'ready');
};

type PageFixtures = {
  reloadPage: () => Promise<void>;
};

export const test = base.extend<PageFixtures>({
  page: async ({ page }, use) => {
    // ---------- BEFORE EACH TEST ----------

    // Set local storage before navigating to the page
    await page.context().addInitScript((key) => {
      window.localStorage.setItem(key, 'true');
    }, LOCAL_STORAGE_KEYS.ONBOARDING_SHOWN);

    // Navigate to page with localStorage already set
    await page.goto('/');

    await waitForAppReady(page);

    await use(page);
  },
  reloadPage: async ({ page }, use) => {
    await use(async () => {
      await page.reload();
      await waitForAppReady(page);
    });
  },
});

// Allow serving locally cached modules for offline testing
test.beforeEach(async ({ context }) => {
  const isCI = !!process.env.CI;

  // This will check if we have a local cached version of the file in dist/static
  // and use that instead when not in CI environment
  await context.route(
    /^https:\/\/cdn\.jsdelivr\.net\/npm\/@duckdb\/duckdb-wasm.*|^https:\/\/extensions\.duckdb\.org\/.*|https:\/\/cdn\.sheetjs\.com\/.*/,
    async (route) => {
      const url = new URL(route.request().url());

      if (!isCI) {
        // Extract the path from the URL
        const urlPath = url.pathname;
        // Get the filename from the path
        const fileName = path.basename(urlPath);
        // Check if the file exists in dist/static
        const staticFilePath = path.resolve(process.cwd(), 'dist/static', fileName);

        if (fs.existsSync(staticFilePath)) {
          // If the file exists locally, serve it
          const fileContent = await fs.promises.readFile(staticFilePath);
          // Determine content type based on file extension
          const contentType = getContentTypeFromFileName(fileName);
          await route.fulfill({
            status: 200,
            contentType,
            body: fileContent,
          });
          return;
        }
      }

      // Fallback to default behavior if file doesn't exist locally or we're in CI
      await route.fallback();
    },
  );
});

// Helper function to determine content type from file name
function getContentTypeFromFileName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.js':
      return 'application/javascript';
    case '.wasm':
      return 'application/wasm';
    case '.json':
      return 'application/json';
    case '.html':
      return 'text/html';
    case '.css':
      return 'text/css';
    default:
      return 'application/octet-stream';
  }
}
