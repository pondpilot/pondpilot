import { expect, mergeTests } from '@playwright/test';

import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';

const test = mergeTests(baseTest, scriptExplorerTest, scriptEditorTest);

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
}) => {
  await createScriptAndSwitchToItsTab();

  // Focus the editor
  await scriptEditorContent.click();

  // Type something to make sure the editor is active
  await scriptEditorContent.pressSequentially('select');

  await page.keyboard.press('ControlOrMeta+KeyS');

  // Verify that the notification appears
  const notification = page.locator('.mantine-Notifications-notification');

  // Verify the notification content
  await expect(notification.getByText('Auto-save enabled')).toBeVisible();
  await expect(notification.getByText('Content is always automatically saved')).toBeVisible();
});
