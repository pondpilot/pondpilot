import * as fs from 'fs';
import * as path from 'path';

import { test as base } from '@playwright/test';
import type { Route } from '@playwright/test';

import { getModuleCacheKey, moduleCacheResources, sha256 } from '../../../scripts/module-cache.mjs';

const moduleCacheByUrl = new Map(moduleCacheResources.map((resource) => [resource.url, resource]));
const verifiedModuleCacheEntries = new Set<string>();
const defaultModuleRequestHosts = new Set([
  ...moduleCacheResources.map((resource) => new URL(resource.url).host),
  'community-extensions.duckdb.org',
  'nightly-extensions.duckdb.org',
  'cdn.sheetjs.com',
]);

export const test = base.extend<{ forEachTest: void }>({
  forEachTest: [
    async ({ context }, use, testInfo) => {
      const isDebugMode = !!process.env.PLAYWRIGHT_DEBUG_TESTS;
      const moduleRequestHosts = new Set([
        ...defaultModuleRequestHosts,
        ...getHostsFromUrls([
          process.env.VITE_DUCKDB_WASM_MAIN_MODULE,
          process.env.VITE_DUCKDB_WASM_MAIN_WORKER,
          process.env.VITE_DUCKDB_WASM_PTHREAD_WORKER,
          process.env.VITE_QUACK_WASM_EXTENSION_URL,
        ]),
      ]);

      // Catch-all route to mock any other external requests
      await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1).*/, async (route) => {
        const requestUrl = route.request().url();
        if (requestUrl.startsWith('https://fonts.gstatic.com/')) {
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

      // Serve only checksum-verified, pre-seeded DuckDB resources. Any new CDN request is a
      // dependency change and must be added to the manifest deliberately before tests can run.
      await context.route(
        (url) => moduleRequestHosts.has(url.host),
        async (route) => {
          const requestUrl = route.request().url();
          const url = new URL(requestUrl);
          if (isDebugMode) {
            // eslint-disable-next-line no-console
            console.debug(`🌐 [${testInfo.title}] Intercepting request: ${url.pathname}`);
          }

          const resource = moduleCacheByUrl.get(requestUrl);
          if (!resource) {
            await safeAbort(route);
            throw new Error(
              `Unexpected module CDN request: ${requestUrl}. ` +
                'Add the exact URL and checksum to scripts/module-cache.mjs.',
            );
          }

          const fileName = path.basename(url.pathname);
          const cacheFileName = getModuleCacheKey(url);
          const staticFilePath = path.resolve(process.cwd(), '.module-cache', cacheFileName);

          let fileContent: Buffer;
          try {
            fileContent = await fs.promises.readFile(staticFilePath);
          } catch (error) {
            await safeAbort(route);
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
              throw new Error(
                `Missing pre-seeded module cache entry for ${requestUrl}. ` +
                  'Run yarn cache:test-modules before Playwright.',
              );
            }
            throw error;
          }

          if (!verifiedModuleCacheEntries.has(staticFilePath)) {
            const actualChecksum = sha256(fileContent);
            if (actualChecksum !== resource.sha256) {
              await safeAbort(route);
              throw new Error(
                `Checksum mismatch for ${requestUrl}: expected ${resource.sha256}, ` +
                  `received ${actualChecksum}. Run yarn cache:test-modules to repair the cache.`,
              );
            }
            verifiedModuleCacheEntries.add(staticFilePath);
          }

          if (isDebugMode) {
            // eslint-disable-next-line no-console
            console.debug(`📁 [${testInfo.title}] Serving verified cache entry: ${cacheFileName}`);
          }

          await safeFulfill(route, {
            status: 200,
            contentType: getContentTypeFromFileName(fileName),
            body: fileContent,
          });
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

function getHostsFromUrls(urls: Array<string | undefined>): Set<string> {
  return new Set(
    urls.flatMap((url) => {
      if (!url) return [];
      try {
        return [new URL(url).host];
      } catch {
        return [];
      }
    }),
  );
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
