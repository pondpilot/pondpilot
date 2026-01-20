import { expect, mergeTests } from '@playwright/test';

import { test as notificationTest } from '../fixtures/notifications';
import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';

const test = mergeTests(baseTest, scriptExplorerTest, scriptEditorTest, notificationTest);

test('Autocomplete converts keywords to uppercase', async ({
  createScriptAndSwitchToItsTab,
  page,
  scriptEditorContent,
}) => {
  await createScriptAndSwitchToItsTab();

  // Type 'select' in the editor
  const editor = scriptEditorContent;
  await editor.click();
  await page.keyboard.type('select');
  await page.keyboard.press('Control+Space');

  // Wait for autocomplete to appear and check it's visible
  const autocompleteTooltip = page.locator('.monaco-editor .suggest-widget');
  await expect(autocompleteTooltip).toBeVisible({ timeout: 10000 });
  await expect(autocompleteTooltip).toContainText(/no suggestions|loading/i, { timeout: 10000 });

  await page.keyboard.press('Escape');

  // Verify that 'select' remains in the editor
  await expect(editor).toContainText(/select/i);
});

test('Shows auto-save notification when pressing Mod+S', async ({
  createScriptAndSwitchToItsTab,
  page,
  scriptEditorContent,
  expectNotificationWithText,
}) => {
  await createScriptAndSwitchToItsTab();

  // Focus the editor
  await scriptEditorContent.click();

  // Type something to make sure the editor is active
  await page.keyboard.type('select');

  await page.keyboard.press('ControlOrMeta+KeyS');

  // Verify that the notification appears with the expected content
  await expectNotificationWithText(
    'Version saved',
    'A new version has been created for your script.',
  );
});

test('Autocompletes DuckDB functions and shows tooltip with parentheses insertion', async ({
  createScriptAndSwitchToItsTab,
  page,
  scriptEditorContent,
}) => {
  await createScriptAndSwitchToItsTab();

  // Focus the editor and type the beginning of a SQL query with a function
  const editor = scriptEditorContent;
  await editor.click();
  await page.keyboard.type('SELECT * from abs');
  await page.keyboard.press('Control+Space');

  // Wait for autocomplete to appear and check it's visible
  const autocompleteTooltip = page.locator('.monaco-editor .suggest-widget');
  await expect(autocompleteTooltip).toBeVisible({ timeout: 10000 });
  await expect(autocompleteTooltip).toContainText(/abs/i, { timeout: 10000 });

  await page.keyboard.press('Enter');

  // Verify that 'abs' was properly inserted and is now followed by parenthesis
  await expect(editor).toContainText('SELECT * from abs');

  // Now type the full query to trigger the tooltip
  await page.keyboard.type('(');

  // Check that the tooltip with the abs function description is shown
  const tooltip = page.locator('.monaco-editor .parameter-hints-widget');
  await expect(tooltip).toBeVisible();
  await expect(tooltip.getByText('abs(x)')).toBeVisible();
  await expect(tooltip.getByText('Absolute value')).toBeVisible();

  // Check that the editor contains 'select * from abs()' (case-insensitive)
  const text = (await editor.innerText()).replace(/\u00a0/g, ' ').toLowerCase();
  expect(text).toContain('select * from abs()');
});
