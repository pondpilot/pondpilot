import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['junit', { outputFile: 'playwright-report/results.xml', includeRetries: true }],
    ['html', { open: 'never', outputFolder: 'playwright-report/html' }],
  ],
});
