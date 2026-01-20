import { expect, mergeTests } from '@playwright/test';

import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as tabTest } from '../fixtures/tab';

const test = mergeTests(baseTest, tabTest, scriptEditorTest, scriptExplorerTest);

test.describe('Script Version History', () => {
  test('should manage version history button visibility', async ({
    page,
    createScriptAndSwitchToItsTab,
    fillScript,
  }) => {
    await page.waitForSelector('[data-testid="script-explorer"]', { state: 'visible' });
    await createScriptAndSwitchToItsTab();

    // Type some content first to trigger version tracking
    await fillScript('SELECT 1;');

    // Save to create a version
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByText('Version saved')).toBeVisible();

    // Wait for alert to disappear before checking button state
    await expect(page.getByText('Version saved')).toBeHidden({ timeout: 5000 });

    // Button should be visible after save (there's at least one version)
    const versionHistoryButton = page.getByTestId('version-history-button');
    await expect(versionHistoryButton).toBeVisible({ timeout: 10000 });
  });

  test('should create versions on save and run', async ({
    page,
    createScriptAndSwitchToItsTab,
    fillScript,
    runScript,
  }) => {
    await page.waitForSelector('[data-testid="script-explorer"]', { state: 'visible' });
    await createScriptAndSwitchToItsTab();

    // Manual save creates version
    await fillScript('SELECT 1;');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByText('Version saved')).toBeVisible();
    await expect(page.getByText('Version saved')).toBeHidden({ timeout: 5000 });

    // Wait between versions to respect MIN_VERSION_INTERVAL_MS (1000ms minimum between versions)
    await page.waitForTimeout(1500);

    // Change content and run to create another version
    await fillScript('SELECT 2;');
    await runScript();

    // Button appears after state updates complete
    const versionHistoryButton = page.getByTestId('version-history-button');
    await expect(versionHistoryButton).toBeVisible({ timeout: 10000 });

    // Open version history sidebar
    await versionHistoryButton.click();

    // Check if sidebar is visible with version items
    const sidebar = page.getByTestId('version-history-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Check that we have versions in the sidebar
    const versionItems = sidebar.locator('[data-testid="version-item"]');
    await expect(versionItems.first()).toBeVisible({ timeout: 10000 });
    const count = await versionItems.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('should show diff editor and action buttons when version selected', async ({
    page,
    createScriptAndSwitchToItsTab,
    fillScript,
  }) => {
    await page.waitForSelector('[data-testid="script-explorer"]', { state: 'visible' });
    await createScriptAndSwitchToItsTab();

    // Create a version
    await fillScript('SELECT 1;');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByText('Version saved')).toBeVisible();
    await expect(page.getByText('Version saved')).toBeHidden({ timeout: 5000 });

    // Wait between versions to respect MIN_VERSION_INTERVAL_MS (1000ms minimum between versions)
    await page.waitForTimeout(1500);

    // Change content to make version history button visible
    await fillScript('SELECT 2;');

    // Open version history sidebar (expect handles debounce wait)
    const versionHistoryButton = page.getByTestId('version-history-button');
    await expect(versionHistoryButton).toBeVisible({ timeout: 10000 });
    await versionHistoryButton.click();

    const sidebar = page.getByTestId('version-history-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Version items should be visible in sidebar
    const versionItems = sidebar.locator('[data-testid="version-item"]');
    await expect(versionItems.first()).toBeVisible({ timeout: 10000 });

    // Verify we have at least one version
    const count = await versionItems.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Click on the first version item to select it
    await versionItems.first().click();

    // Check that diff editor is visible (single mode)
    const diffEditor = page.getByTestId('version-diff-single');
    await expect(diffEditor).toBeVisible();

    // Check that action buttons are visible in the top pane
    const restoreButton = page.getByTestId('restore-version-button');
    await expect(restoreButton).toBeVisible();
  });

  test('should exit history mode with Escape key', async ({
    page,
    createScriptAndSwitchToItsTab,
    fillScript,
  }) => {
    await page.waitForSelector('[data-testid="script-explorer"]', { state: 'visible' });
    await createScriptAndSwitchToItsTab();

    // Create a version and make history button visible
    await fillScript('SELECT 1;');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByText('Version saved')).toBeVisible();
    await expect(page.getByText('Version saved')).toBeHidden({ timeout: 5000 });
    // Wait between versions to respect MIN_VERSION_INTERVAL_MS (1000ms minimum between versions)
    await page.waitForTimeout(1500);
    await fillScript('SELECT 2;');

    // Open version history sidebar (expect handles debounce wait)
    const versionHistoryButton = page.getByTestId('version-history-button');
    await expect(versionHistoryButton).toBeVisible({ timeout: 10000 });
    await versionHistoryButton.click();

    // Verify sidebar is visible
    const sidebar = page.getByTestId('version-history-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Press Escape to exit history mode
    await page.keyboard.press('Escape');

    // Sidebar should be hidden
    await expect(sidebar).toBeHidden({ timeout: 5000 });
  });

  test('should exit history mode with close button', async ({
    page,
    createScriptAndSwitchToItsTab,
    fillScript,
  }) => {
    await page.waitForSelector('[data-testid="script-explorer"]', { state: 'visible' });
    await createScriptAndSwitchToItsTab();

    // Create a version and make history button visible
    await fillScript('SELECT 1;');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByText('Version saved')).toBeVisible();
    await expect(page.getByText('Version saved')).toBeHidden({ timeout: 5000 });
    // Wait between versions to respect MIN_VERSION_INTERVAL_MS (1000ms minimum between versions)
    await page.waitForTimeout(1500);
    await fillScript('SELECT 2;');

    // Open version history sidebar
    const versionHistoryButton = page.getByTestId('version-history-button');
    await expect(versionHistoryButton).toBeVisible({ timeout: 10000 });
    await versionHistoryButton.click();

    // Verify sidebar is visible
    const sidebar = page.getByTestId('version-history-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Click close button
    const closeButton = page.getByTestId('version-history-close-button');
    await closeButton.click();

    // Sidebar should be hidden
    await expect(sidebar).toBeHidden({ timeout: 5000 });
  });
});
