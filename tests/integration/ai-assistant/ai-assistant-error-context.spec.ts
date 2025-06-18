import { expect, mergeTests } from '@playwright/test';

import { test as notificationTest } from '../fixtures/notifications';
import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as storageTest } from '../fixtures/storage';

const test = mergeTests(
  baseTest,
  scriptEditorTest,
  scriptExplorerTest,
  storageTest,
  notificationTest,
);

test.describe('AI Assistant Error Context', () => {
  test.beforeEach(async ({ createScriptAndSwitchToItsTab }) => {
    await createScriptAndSwitchToItsTab();
  });

  test('should show error context when opening AI assistant after SQL error', async ({
    page,
    scriptEditorContent,
    expectNotificationWithText,
  }) => {
    // Type invalid SQL
    await scriptEditorContent.pressSequentially('SELECT * FROM non_existent_table;');

    // Execute to trigger error
    await page.keyboard.press('ControlOrMeta+Enter');

    // Wait for error notification
    await expectNotificationWithText('Query failed', /table.*not found|does not exist/i);

    // Open AI assistant
    await page.keyboard.press('ControlOrMeta+i');
    const widget = page.locator('.cm-ai-assistant-widget');
    await expect(widget).toBeVisible();

    // Context should be auto-expanded when there's an error
    const contextContent = widget.locator('.ai-widget-context-content');
    await expect(contextContent).toBeVisible();

    // Should show error context
    const errorSection = contextContent.locator('.ai-widget-context-subsection').first();
    await expect(errorSection).toHaveCSS('border-left-color', 'rgb(231, 76, 60)');

    const errorLabel = errorSection.locator('.ai-widget-context-sublabel');
    await expect(errorLabel).toContainText('SQL Error:');

    const errorMessage = errorSection.locator('.ai-widget-context-code');
    await expect(errorMessage).toContainText(/table.*not found|does not exist/i);

    // Placeholder should indicate error fixing
    const textarea = widget.locator('.ai-widget-textarea');
    await expect(textarea).toHaveAttribute(
      'placeholder',
      'Press Enter to fix the error, or describe what you want...',
    );

    // Button should say "Fix Error"
    const generateBtn = widget.locator('.ai-widget-generate');
    await expect(generateBtn).toHaveText('Fix Error');
    await expect(generateBtn).toHaveAttribute('aria-label', 'Fix SQL error');
  });

  test('should clear error context after applying fix', async ({
    page,
    scriptEditorContent,
    scriptEditor,
    expectNotificationWithText,
  }) => {
    // Create an error condition
    await scriptEditorContent.pressSequentially('SELECT * FROM non_existent_table;');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expectNotificationWithText('Query failed', /table.*not found|does not exist/i);

    // Open AI assistant
    await page.keyboard.press('ControlOrMeta+i');
    const widget = page.locator('.cm-ai-assistant-widget');

    // Verify error context is shown
    const errorSection = widget.locator('.ai-widget-context-subsection').first();
    await expect(errorSection).toContainText('SQL Error:');

    // Close AI assistant
    await page.keyboard.press('Escape');

    // Fix the SQL manually
    await scriptEditor.selectText();
    await scriptEditorContent.pressSequentially('SELECT 1 as test;');

    // Execute successfully
    await page.keyboard.press('ControlOrMeta+Enter');

    // Wait for results to appear (indicates successful execution)
    await page.waitForTimeout(1000);

    // Open AI assistant again
    await page.keyboard.press('ControlOrMeta+i');

    // Error context should be gone
    const contextContent = widget.locator('.ai-widget-context-content');
    const contextHeader = widget.locator('.ai-widget-context-left');

    // Expand context to check
    await contextHeader.click();
    await expect(contextContent).toBeVisible();

    // Should not have error section
    const errorSections = contextContent.locator('.ai-widget-context-subsection');
    const count = await errorSections.count();

    let hasErrorSection = false;
    for (let i = 0; i < count; i += 1) {
      const text = await errorSections.nth(i).textContent();
      if (text?.includes('SQL Error:')) {
        hasErrorSection = true;
        break;
      }
    }
    expect(hasErrorSection).toBe(false);

    // Placeholder should be normal
    const textarea = widget.locator('.ai-widget-textarea');
    await expect(textarea).toHaveAttribute(
      'placeholder',
      'Ask AI to help with your SQL... (use @ to mention tables)',
    );

    // Button should say "Generate"
    const generateBtn = widget.locator('.ai-widget-generate');
    await expect(generateBtn).toHaveText('Generate');
  });
});
