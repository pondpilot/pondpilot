import * as fs from 'fs';
import * as path from 'path';

import { test as base } from '@playwright/test';

export const test = base.extend<{ forEachTest: void }>({
  forEachTest: [
    async ({ page }, use) => {
      // Block Google Fonts requests - will prevent waiting for these resources and speed up tests
      await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)/, (route) =>
        route.abort('timedout'),
      );

      // Allow serving locally cached modules for offline testing.
      // This will check if we have a pre-cached duckdb & other big modules, or cache them on the fly
      await page.route(
        /^https:\/\/cdn\.jsdelivr\.net\/npm\/@duckdb\/duckdb-wasm.*|^https:\/\/extensions\.duckdb\.org\/.*|https:\/\/cdn\.sheetjs\.com\/.*/,
        async (route) => {
          const url = new URL(route.request().url());
          console.warn(`🌐 Intercepting request: ${url.pathname}`);

          // Extract the path from the URL
          const urlPath = url.pathname;
          // Get the filename from the path
          const fileName = path.basename(urlPath);

          // Check if the file exists in .module-cache
          const staticFilePath = path.resolve(process.cwd(), '.module-cache', fileName);

          if (fs.existsSync(staticFilePath)) {
            // If the file exists locally, serve it and cache it in memory
            console.warn(`📁 Serving cached file: ${fileName} from cache`);
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

          // For files we don't have cached yet, intercept and save for future runs
          try {
            const response = await route.fetch();
            const body = await response.body();
            const headers = response.headers();

            // Also save to disk for future test runs if ok
            if (response.ok()) {
              console.warn(`💾 Automatically caching ${fileName} in .module-cache`);

              const cachePath = path.resolve(process.cwd(), '.module-cache');
              if (!fs.existsSync(cachePath)) {
                fs.mkdirSync(cachePath, { recursive: true });
              }
              fs.writeFileSync(path.join(cachePath, fileName), body);
              console.warn(`✅ Successfully cached ${fileName}`);
            }

            // Return the original response
            await route.fulfill({
              status: response.status(),
              headers,
              body,
            });
          } catch (error) {
            console.error('Error fetching the route:', error);
            await route.abort();
          }
        },
      );

      await use();

      // Clean up
      console.warn('🧹 Starting cleanup - unrouting all routes');
      await page.unrouteAll({ behavior: 'wait' });
      console.warn('✅ Cleanup completed');
    },
    { auto: true },
  ], // automatically starts for every test.
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
