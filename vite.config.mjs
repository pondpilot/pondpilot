import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { VitePWA } from 'vite-plugin-pwa';
import svgr from 'vite-plugin-svgr';
import { execSync } from 'child_process';
import { resolve } from 'path';

const getVersionInfo = () => {
  try {
    const gitTag = execSync('git describe --exact-match --tags 2> /dev/null || echo ""')
      .toString()
      .trim();

    if (gitTag) {
      return `v${gitTag}`;
    } else {
      return ``;
    }
  } catch (e) {
    return ``;
  }
};

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),
      tsconfigPaths(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          maximumFileSizeToCacheInBytes: 25000000,
          // Cache duckdb CDN resources
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@duckdb\/duckdb-wasm\/.*/,
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
              src: '192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '512.png',
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
    define: {
      __VERSION__: JSON.stringify(getVersionInfo()),
    },
  };
});
