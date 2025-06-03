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
  await editor.pressSequentially('select');

  // Wait for autocomplete to appear and check it's visible
  const autocompleteTooltip = page.locator('.cm-tooltip-autocomplete');
  await expect(autocompleteTooltip).toBeVisible();

  // Use a more specific selector that matches only the exact "SELECT" option
  const selectOption = autocompleteTooltip.getByRole('option', { name: 'SELECT', exact: true });
  await expect(selectOption).toBeVisible();

  // Click on the exact SELECT option
  await selectOption.click();

  // Verify that 'select' has been converted to uppercase 'SELECT'
  await expect(editor).toContainText('SELECT');
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
  await scriptEditorContent.pressSequentially('select');

  await page.keyboard.press('ControlOrMeta+KeyS');

  // Verify that the notification appears with the expected content
  await expectNotificationWithText(
    'Auto-save enabled',
    "Your changes are always saved automatically. You don't need to press 'Save' manually.",
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
  await editor.pressSequentially('SELECT * from abs');

  // Wait for autocomplete to appear and check it's visible
  const autocompleteTooltip = page.locator('.cm-tooltip-autocomplete');
  await expect(autocompleteTooltip).toBeVisible();

  // Find the abs function in the autocomplete list
  const absOption = autocompleteTooltip.getByRole('option', { name: 'abs', exact: true });
  await expect(absOption).toBeVisible();

  // Verify it has the function icon
  await expect(absOption.locator('.cm-completionIcon-function')).toBeVisible();

  // Click on the abs option
  await absOption.click();

  // Verify that 'abs' was properly inserted and is now followed by parenthesis
  await expect(editor).toContainText('SELECT * from abs');

  // Now type the full query to trigger the tooltip
  await editor.pressSequentially('(');

  // Check that the tooltip with the abs function description is shown
  const tooltip = page.locator('.cm-tooltip-cursor');
  await expect(tooltip).toBeVisible();
  await expect(tooltip.getByText('abs(x)')).toBeVisible();
  await expect(tooltip.getByText('Absolute value')).toBeVisible();

  // Check that the editor contains 'select * from abs()' (case-insensitive)
  const text = (await editor.innerText()).toLowerCase();
  expect(text).toContain('select * from abs()');
});
