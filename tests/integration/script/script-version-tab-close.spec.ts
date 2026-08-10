import { expect, mergeTests } from '@playwright/test';

import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as tabTest } from '../fixtures/tab';

const test = mergeTests(baseTest, tabTest, scriptEditorTest, scriptExplorerTest);

test.describe('Script Version - Tab Management', () => {
  test('should switch tabs after saving and editing a versioned script', async ({
    page,
    createScriptAndSwitchToItsTab,
    fillScript,
  }) => {
    await page.waitForSelector('[data-testid="script-explorer"]', { state: 'visible' });

    // Create first script with content
    await createScriptAndSwitchToItsTab();
    await fillScript('SELECT 1;');

    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByText('Version saved')).toBeVisible();

    await fillScript('SELECT 2;');

    // Create second script (this should trigger auto-save of first)
    await createScriptAndSwitchToItsTab();

    const tabs = page.locator('[data-testid^="data-tab-handle-"]');
    await expect(tabs).toHaveCount(2);
  });
});
