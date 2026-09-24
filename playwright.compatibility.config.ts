import { defineConfig, devices } from '@playwright/test';

import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  testDir: './tests/compatibility',
  // These scheduled scenarios document known browser gaps without spending CI time on retries.
  retries: 0,
  projects: [
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  reporter: process.env.CI
    ? [
        ['junit', { outputFile: './playwright-report/compatibility-results.xml' }],
        ['html', { open: 'never', outputFolder: './playwright-report/html' }],
      ]
    : [['list', { printSteps: true }]],
});
