import { expect, mergeTests } from '@playwright/test';

import { test as baseTest } from '../fixtures/page';
import { test as settingsTest } from '../fixtures/settings';

const test = mergeTests(baseTest, settingsTest);

test('Lint toggle is visible and enabled by default', async ({ openSettings }) => {
  const settingsPage = await openSettings();

  const lintSection = settingsPage.getByRole('heading', { name: 'SQL Linting' });
  await expect(lintSection).toBeVisible();

  const lintToggle = settingsPage.getByTestId('lint-toggle');
  await expect(lintToggle).toBeChecked();
});

test('Lint toggle state persists after closing and reopening settings', async ({
  page,
  openSettings,
}) => {
  const settingsPage = await openSettings();

  // Disable linting — click the Switch track (visible sibling of the hidden input)
  const lintSwitch = settingsPage.getByTestId('lint-toggle').locator('..');
  await lintSwitch.click();

  // Close settings
  const closeButton = settingsPage.getByTestId('settings-page-close-button');
  await closeButton.click();
  await expect(settingsPage).not.toBeAttached();

  // Re-open settings
  await page.getByTestId('settings-button').click();
  const reopenedSettings = page.getByTestId('settings-page');
  await expect(reopenedSettings).toBeVisible();

  // Verify toggle is still off
  const reopenedToggle = reopenedSettings.getByTestId('lint-toggle');
  await expect(reopenedToggle).not.toBeChecked();
});

test('Severity filter selection persists', async ({ page, openSettings }) => {
  const settingsPage = await openSettings();

  // Select "Errors only" filter
  const severityFilter = settingsPage.getByTestId('lint-severity-filter');
  await severityFilter.getByText('Errors only').click();

  // Close and re-open settings
  const closeButton = settingsPage.getByTestId('settings-page-close-button');
  await closeButton.click();
  await expect(settingsPage).not.toBeAttached();

  await page.getByTestId('settings-button').click();
  const reopenedSettings = page.getByTestId('settings-page');
  await expect(reopenedSettings).toBeVisible();

  // Verify "Errors only" is the active segment by checking the active label
  const activeLabel = reopenedSettings
    .getByTestId('lint-severity-filter')
    .locator('label[data-active]');
  await expect(activeLabel).toContainText('Errors only');
});

test('Disabled rule badges appear and can be removed', async ({ page, openSettings }) => {
  // Pre-set a disabled rule via localStorage
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem('pondpilot-editor-preferences') || '{}');
    prefs.lintDisabledRules = ['LINT_AM_004'];
    localStorage.setItem('pondpilot-editor-preferences', JSON.stringify(prefs));
  });

  const settingsPage = await openSettings();

  // Verify the disabled rule badge appears
  const disabledRules = settingsPage.getByTestId('lint-disabled-rules');
  await expect(disabledRules).toBeVisible();
  await expect(disabledRules.getByText('LINT_AM_004')).toBeVisible();

  // Click the X to remove the rule
  await settingsPage.getByTestId('lint-remove-rule-LINT_AM_004').click();

  // Verify the badge is gone
  await expect(disabledRules).not.toBeAttached();
});
