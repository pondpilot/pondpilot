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

    // Button should be hidden when content matches the saved version
    const versionHistoryButton = page.getByTestId('version-history-button');
    await expect(versionHistoryButton).toBeHidden();

    // Edit content - button should appear
    await fillScript('SELECT 2;');
    await expect(versionHistoryButton).toBeVisible({ timeout: 5000 });
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

    // Wait between versions to respect MIN_VERSION_INTERVAL_MS
    await page.waitForTimeout(1500);

    // Change content and run to create another version
    await fillScript('SELECT 2;');
    await runScript();

    // Wait for version history button to appear
    const versionHistoryButton = page.getByTestId('version-history-button');
    await expect(versionHistoryButton).toBeVisible({ timeout: 5000 });

    // Open version history
    await versionHistoryButton.click();

    // Check if modal content is visible instead of the modal root
    const modalContent = page.locator(
      '[data-testid="version-history-modal"] [data-testid="version-item"]',
    );
    await expect(modalContent.first()).toBeVisible({ timeout: 10000 });

    // Check that we have versions
    const versionItems = page.locator('[data-testid="version-item"]');
    const count = await versionItems.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('should show version preview with restore and copy buttons', async ({
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

    // Wait between versions to respect MIN_VERSION_INTERVAL_MS
    await page.waitForTimeout(1500);

    // Change content to make version history button visible
    await fillScript('SELECT 2;');

    // Open version history
    const versionHistoryButton = page.getByTestId('version-history-button');
    await expect(versionHistoryButton).toBeVisible({ timeout: 5000 });
    await versionHistoryButton.click();

    // Wait for modal content to be visible
    const versionItems = page.locator('[data-testid="version-item"]');
    await expect(versionItems.first()).toBeVisible({ timeout: 10000 });

    // Verify we have at least one version
    const count = await versionItems.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Click on the first version item to select it
    await versionItems.first().click();

    // Check that preview panel is visible with action buttons
    const preview = page.locator('[data-testid="version-preview"]');
    await expect(preview).toBeVisible();

    const restoreButton = page.getByRole('button', { name: 'Restore' });
    await expect(restoreButton).toBeVisible();

    const copyButton = page.getByRole('button', { name: 'Copy' });
    await expect(copyButton).toBeVisible();
  });
});
