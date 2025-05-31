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

    // Button should be hidden when content matches the saved version
    const versionHistoryButton = page.getByTestId('version-history-button');
    await page.waitForTimeout(1000);
    await expect(versionHistoryButton).toBeHidden();

    // Edit content - button should appear
    await fillScript('SELECT 2;');
    await page.waitForTimeout(1000);
    await expect(versionHistoryButton).toBeVisible();
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

    // Wait between versions to respect MIN_VERSION_INTERVAL_MS
    await page.waitForTimeout(2000);

    // Change content and run to create another version
    await fillScript('SELECT 2;');
    await runScript();

    // Wait for version history button to appear
    await page.waitForTimeout(1000);
    const versionHistoryButton = page.getByTestId('version-history-button');
    await expect(versionHistoryButton).toBeVisible();

    // Open version history
    await versionHistoryButton.click();

    // Wait a bit for modal animation
    await page.waitForTimeout(1000);

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

  test('should show version preview and restore button', async ({
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

    // Change content to make version history button visible
    await page.waitForTimeout(2000);
    await fillScript('SELECT 2;');

    // Open version history
    const versionHistoryButton = page.getByTestId('version-history-button');
    await expect(versionHistoryButton).toBeVisible();
    await versionHistoryButton.click();

    // Wait for modal content to be visible
    await page.waitForTimeout(1000);
    const versionItems = page.locator('[data-testid="version-item"]');
    await expect(versionItems.first()).toBeVisible({ timeout: 10000 });

    // Click on the first version item to select it
    const firstVersionItem = versionItems.first();
    await firstVersionItem.click();

    // Check that preview shows the content
    const preview = page.locator('[data-testid="version-preview"]');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('SELECT 1;');

    // Check that restore button is visible
    const restoreButton = page.getByRole('button', { name: 'Restore' });
    await expect(restoreButton).toBeVisible();
  });

  test('should show version preview', async ({
    page,
    createScriptAndSwitchToItsTab,
    fillScript,
  }) => {
    await page.waitForSelector('[data-testid="script-explorer"]', { state: 'visible' });
    await createScriptAndSwitchToItsTab();

    const content = 'SELECT * FROM users WHERE active = true;';

    await fillScript(content);
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByText('Version saved')).toBeVisible();

    // Change content to show version history button
    await page.waitForTimeout(2000);
    await fillScript('SELECT 99;');

    // Open version history
    const versionHistoryButton = page.getByTestId('version-history-button');
    await expect(versionHistoryButton).toBeVisible();
    await versionHistoryButton.click();

    // Wait for modal content
    await page.waitForTimeout(1000);
    const versionItems = page.locator('[data-testid="version-item"]');
    await expect(versionItems.first()).toBeVisible({ timeout: 10000 });

    // Click first version to show preview
    await versionItems.first().click();

    // Check preview
    const preview = page.locator('[data-testid="version-preview"]');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(content);
  });
});
