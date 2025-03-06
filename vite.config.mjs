import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { VitePWA } from 'vite-plugin-pwa';
import svgr from 'vite-plugin-svgr';
import { execSync } from 'child_process';
import { resolve } from 'path';

// Function to get version information
function getVersionInfo() {
  try {
    // Check if this is a tagged commit (for release)
    const gitTag = execSync('git describe --exact-match --tags 2> /dev/null || echo ""')
      .toString()
      .trim();

    if (gitTag) {
      // Return the tag as version for tagged commits
      return `v${gitTag}`;
    } else {
      // For non-tagged commits, return the build date
      return `Build: ${new Date().toUTCString()}`;
    }
  } catch (e) {
    // Fallback in case of any errors
    return `Build: ${new Date().toUTCString()}`;
  }
}

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),

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
        },
      }),
      svgr(),
    ],
    resolve: {
      alias: {
        '@pages': resolve(__dirname, 'src/pages'),
        '@components': resolve(__dirname, 'src/components'),
        '@utils': resolve(__dirname, 'src/utils'),
        '@features': resolve(__dirname, 'src/features'),
        '@store': resolve(__dirname, 'src/store'),
        '@hooks': resolve(__dirname, 'src/hooks'),
        '@theme': resolve(__dirname, 'src/theme'),
        '@router': resolve(__dirname, 'src/router'),
        '@consts': resolve(__dirname, 'src/consts'),
        '@models': resolve(__dirname, 'src/models'),
      },
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
