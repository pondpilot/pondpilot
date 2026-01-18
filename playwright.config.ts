import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const workersOverride = process.env.PLAYWRIGHT_WORKERS;
const parsedWorkersOverride = workersOverride
  ? Number.isNaN(Number(workersOverride))
    ? workersOverride
    : Number(workersOverride)
  : undefined;

export default defineConfig({
  testDir: './tests/integration',
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Opt out of parallel tests on CI. */
  workers: parsedWorkersOverride ?? (process.env.CI ? 1 : '80%'),
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [['junit', { outputFile: './playwright-report/results.xml' }]]
    : [['list', { printSteps: true }]],
  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // tests that use non-chromium browsers
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testDir: './tests/integration/webkit',
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
  },
  /* Set the timeout for each test */
  timeout: Number(process.env.PLAYWRIGHT_TIMEOUT ?? 30_000),
});
