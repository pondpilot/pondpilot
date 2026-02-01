import * as fs from 'fs';
import * as path from 'path';

import { test as base } from '@playwright/test';
import type { Route } from '@playwright/test';

export const test = base.extend<{ forEachTest: void }>({
  forEachTest: [
    async ({ context }, use, testInfo) => {
      const isDebugMode = !!process.env.PLAYWRIGHT_DEBUG_TESTS;

      // Catch-all route to mock any other external requests
      await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1).*/, async (route) => {
        const requestUrl = route.request().url();
        const host = (() => {
          try {
            return new URL(requestUrl).host;
          } catch {
            return '';
          }
        })();

        if (
          host === 'cdn.jsdelivr.net' ||
          host === 'extensions.duckdb.org' ||
          host === 'cdn.sheetjs.com' ||
          host === 'fonts.gstatic.com' ||
          host === 'fonts.googleapis.com'
        ) {
          await route.fallback();
          return;
        }

        if (isDebugMode) {
          // eslint-disable-next-line no-console
          console.debug(`🚫 [${testInfo.title}] Blocking external request: ${requestUrl}`);
        }

        // Mock GitHub API responses
        if (requestUrl.includes('api.github.com')) {
          // Return an array for the releases list endpoint
          if (requestUrl.includes('/releases?')) {
            await safeFulfill(route, {
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify([
                {
                  body: '# Test Release v1.0.0\n\n## Features\n- Mock feature 1\n- Mock feature 2\n\n## Bug Fixes\n- Fixed mock issue',
                  tag_name: 'v1.0.0',
                  name: 'Test Release v1.0.0',
                  html_url: 'https://github.com/pondpilot/pondpilot/releases/tag/v1.0.0',
                  published_at: '2025-01-15T00:00:00Z',
                },
                {
                  body: '# Test Release v0.9.0\n\n## Features\n- Older feature\n\n## Bug Fixes\n- Older fix',
                  tag_name: 'v0.9.0',
                  name: 'Test Release v0.9.0',
                  html_url: 'https://github.com/pondpilot/pondpilot/releases/tag/v0.9.0',
                  published_at: '2024-12-01T00:00:00Z',
                },
                {
                  body: '# Test Release v0.5.0\n\n## Features\n- Initial feature',
                  tag_name: 'v0.5.0',
                  name: 'Test Release v0.5.0',
                  html_url: 'https://github.com/pondpilot/pondpilot/releases/tag/v0.5.0',
                  published_at: '2024-06-01T00:00:00Z',
                },
              ]),
            });
          } else {
            await safeFulfill(route, {
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                body: '# Test Release\n\n## Features\n- Mock feature 1\n- Mock feature 2\n\n## Bug Fixes\n- Fixed mock issue',
                tag_name: 'v1.0.0',
                name: 'Test Release',
              }),
            });
          }
          return;
        }

        // Mock YouTube embeds
        if (requestUrl.includes('youtube.com') || requestUrl.includes('youtu.be')) {
          await safeFulfill(route, {
            status: 200,
            contentType: 'text/html',
            body: '<html><body><div>Mock YouTube Video</div></body></html>',
          });
          return;
        }

        // For all other external requests, return a generic response
        await safeFulfill(route, {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Mocked response for testing' }),
        });
      });

      // Block Google Fonts requests - will prevent waiting for these resources and speed up tests
      await context.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)/, (route) =>
        safeFulfill(route, {
          status: 200,
          contentType: 'text/css',
          body: '/* Fonts blocked for testing */',
        }),
      );

      // Allow serving locally cached modules for offline testing.
      // This will check if we have a pre-cached duckdb & other big modules, or cache them on the fly
      await context.route(
        /^https:\/\/cdn\.jsdelivr\.net\/npm\/@duckdb\/duckdb-wasm.*|^https:\/\/extensions\.duckdb\.org\/.*|https:\/\/cdn\.sheetjs\.com\/.*/,
        async (route) => {
          const url = new URL(route.request().url());
          if (isDebugMode) {
            // eslint-disable-next-line no-console
            console.debug(`🌐 [${testInfo.title}] Intercepting request: ${url.pathname}`);
          }

          // Extract the path from the URL
          const urlPath = url.pathname;
          // Get the filename from the path
          const fileName = path.basename(urlPath);

          // Check if the file exists in .module-cache
          const staticFilePath = path.resolve(process.cwd(), '.module-cache', fileName);

          if (fs.existsSync(staticFilePath)) {
            // If the file exists locally, serve it and cache it in memory
            if (isDebugMode) {
              // eslint-disable-next-line no-console
              console.debug(`📁 [${testInfo.title}] Serving cached file: ${fileName} from cache`);
            }
            const fileContent = await fs.promises.readFile(staticFilePath);
            // Determine content type based on file extension
            const contentType = getContentTypeFromFileName(fileName);

            await safeFulfill(route, {
              status: 200,
              contentType,
              body: fileContent,
            });
            return;
          }

          // For files we don't have cached yet, intercept and save for future runs
          try {
            const response = await fetch(route.request().url());
            const arrayBuffer = await response.arrayBuffer();
            const body = Buffer.from(arrayBuffer);

            const headers: Record<string, string> = {};
            response.headers.forEach((value, key) => {
              headers[key] = value;
            });

            // Also save to disk for future test runs if ok
            if (response.ok) {
              if (isDebugMode) {
                // eslint-disable-next-line no-console
                console.debug(
                  `💾 [${testInfo.title}] Automatically caching ${fileName} in .module-cache`,
                );
              }

              const cachePath = path.resolve(process.cwd(), '.module-cache');
              if (!fs.existsSync(cachePath)) {
                fs.mkdirSync(cachePath, { recursive: true });
              }
              await fs.promises.writeFile(path.join(cachePath, fileName), body);
              if (isDebugMode) {
                // eslint-disable-next-line no-console
                console.debug(`✅ [${testInfo.title}] Successfully cached ${fileName}`);
              }
            }

            // Return the original response
            await safeFulfill(route, {
              status: response.status,
              headers,
              body,
            });
          } catch (error) {
            console.error('Error fetching the route:', error);
            await safeAbort(route);
          }
        },
      );

      await use();

      // Clean up
      if (isDebugMode) {
        // eslint-disable-next-line no-console
        console.debug(`🧹 [${testInfo.title}] Starting cleanup - unrouting all routes`);
      }
      await context.unrouteAll({ behavior: 'ignoreErrors' });
      if (isDebugMode) {
        // eslint-disable-next-line no-console
        console.debug(`✅ [${testInfo.title}] Cleanup completed`);
      }
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

type RouteFulfillInput = Parameters<Route['fulfill']>[0];

async function safeFulfill(route: Route, options: RouteFulfillInput) {
  try {
    await route.fulfill(options);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Route is already handled')) {
      return;
    }
    throw error;
  }
}

async function safeAbort(route: Route) {
  try {
    await route.abort();
  } catch (error) {
    if (error instanceof Error && error.message.includes('Route is already handled')) {
      return;
    }
    throw error;
  }
}
