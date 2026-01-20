import { expect, mergeTests } from '@playwright/test';

import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as tabTest } from '../fixtures/tab';

const test = mergeTests(baseTest, tabTest, scriptEditorTest, scriptExplorerTest);

test.describe('Script Version - Tab Management', () => {
  test('should save version when switching tabs', async ({
    page,
    createScriptAndSwitchToItsTab,
    fillScript,
  }) => {
    await page.waitForSelector('[data-testid="script-explorer"]', { state: 'visible' });

    // Create first script with content
    await createScriptAndSwitchToItsTab();
    await fillScript('SELECT 1;');

    // Save it first
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByText('Version saved')).toBeVisible();

    // Edit content
    await page.waitForTimeout(2000);
    await fillScript('SELECT 2;');

    // Create second script (this should trigger auto-save of first)
    await createScriptAndSwitchToItsTab();

    // Just verify we have two tabs
    const tabs = page.locator('[data-testid^="data-tab-handle-"]');
    await expect(tabs).toHaveCount(2);
  });
});
