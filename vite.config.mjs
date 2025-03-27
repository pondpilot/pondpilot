import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { VitePWA } from 'vite-plugin-pwa';
import svgr from 'vite-plugin-svgr';
import basicSsl from '@vitejs/plugin-basic-ssl';

const getVersionInfo = () => {
  try {
    const packageJson = require('./package.json');

    return `v${packageJson.version}`;
  } catch (e) {
    throw new Error('Failed to get version info: ' + e);
  }
};

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),
      tsconfigPaths(),
      // basicSsl(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          maximumFileSizeToCacheInBytes: 50000000,
          // Cache duckdb CDN resources
          runtimeCaching: [
            {
              urlPattern: ({ request }) =>
                request.destination === 'script' && request.url.endsWith('.wasm'),
              handler: 'NetworkOnly',
            },
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
          start_url: '/',
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
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      // https: true,
    },
    preview: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      // https: true,
    },
    define: {
      __VERSION__: JSON.stringify(getVersionInfo()),
    },
  };
});
