import { defineConfig } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/integration',
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /* DuckDB-WASM and OPFS state must never be shared by parallel workers. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [['junit', { outputFile: './playwright-report/results.xml' }]]
    : [['list', { printSteps: true }]],
  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      // Keep the viewport deterministic without emulating a Windows user agent
      // on macOS. Monaco and native clipboard shortcuts must see the same OS.
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
  /* Configure the web server for tests */
  webServer: {
    command: 'npx http-server dist -p 6173 --silent --cors --proxy http://localhost:6173?',
    url: 'http://localhost:6173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2 minutes
  },
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:6173',
    serviceWorkers: 'block',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  /* Set the timeout for each test */
  timeout: Number(process.env.PLAYWRIGHT_TIMEOUT ?? 30_000),
});
