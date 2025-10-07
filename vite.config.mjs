import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { VitePWA } from 'vite-plugin-pwa';
import svgr from 'vite-plugin-svgr';

const getVersionInfo = () => {
  try {
    const packageJson = require('./package.json');

    return `v${packageJson.version}`;
  } catch (e) {
    throw new Error('Failed to get version info: ' + e);
  }
};

export default defineConfig(({ mode }) => {
  // Check for DOCKER_BUILD environment variable
  const isDockerBuild = process.env.DOCKER_BUILD === 'true';

  // Get and normalize base path from environment variable, default to '/'
  // Ensures it both starts and ends with a single '/'
  const getNormalizedBasePath = (value) => {
    let v = (value || '/').trim();
    // Collapse ALL consecutive slashes first
    v = v.replace(/\/+ /g, '/'); // remove any accidental space variants (defensive, then real replace)
    v = v.replace(/\/+ /g, '/');
    v = v.replace(/\/+/, '/'); // final cleanup (will be replaced by global below if needed)
    v = v.replace(/\/+/, '/');
    // Proper global collapse (final authoritative normalization)
    v = v.replace(/\/+/, '/');
    // Ensure leading slash
    if (!v.startsWith('/')) v = '/' + v;
    // Ensure trailing slash
    if (!v.endsWith('/')) v = v + '/';
    // Special-case root (avoid double slash)
    if (v !== '/' && v.endsWith('//')) v = v.slice(0, -1);
    return v.replace(/\/+/, '/');
  };

  const basePath = getNormalizedBasePath(process.env.VITE_BASE_PATH);
  // Provide build-time visibility (won't ship to client bundle)
  // eslint-disable-next-line no-console
  console.log(`[build] Using base path: ${basePath}`);

  return {
    mode: mode === 'int-test-build' ? 'production' : mode,
    base: basePath,
    define: {
      __INTEGRATION_TEST__: mode === 'int-test-build',
      __VERSION__: JSON.stringify(getVersionInfo()),
    },
    plugins: [
      react(),
      tsconfigPaths(),
      VitePWA({
        disable: mode !== 'production' || isDockerBuild, // Disable PWA for Docker builds
        registerType: 'autoUpdate',
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        workbox: {
          maximumFileSizeToCacheInBytes: 25000000,
          // Cache duckdb CDN resources
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@duckdb\/duckdb-wasm.*/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'duckdb-wasm-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            // New runtime caching for duckdb extensions
            {
              urlPattern: /^https:\/\/extensions\.duckdb\.org\/.*/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'duckdb-extensions-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            // SheetJS CDN resources
            {
              urlPattern: /^https:\/\/cdn\.sheetjs\.com\/.*/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'sheetjs-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        manifest: {
          display_override: ['window-controls-overlay'],
          categories: ['productivity'],
          launch_handler: {
            client_mode: 'focus-existing',
          },
          name: 'PondPilot',
          short_name: 'PondPilot',
          start_url: basePath,
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#000000',
          icons: [
            {
              src: './assets/pwa-icons/192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: './assets/pwa-icons/512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: './assets/pwa-icons/512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
      }),
      svgr(),
    ],
    worker: {
      format: 'es',
      plugins: () => [tsconfigPaths()],
    },

    build: {
      sourcemap: mode === 'development',
    },
    optimizeDeps: {
      exclude: ['@duckdb/duckdb-wasm'],
    },
  };
});
