import { expect, mergeTests } from '@playwright/test';

import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as storageTest } from '../fixtures/storage';

const test = mergeTests(baseTest, scriptEditorTest, scriptExplorerTest, storageTest);

test.describe('AI Assistant Integration', () => {
  test.beforeEach(async ({ createScriptAndSwitchToItsTab }) => {
    await createScriptAndSwitchToItsTab();
  });

  test.describe('Basic functionality', () => {
    test('should open AI assistant with keyboard shortcut', async ({
      page,
      scriptEditorContent,
    }) => {
      // Focus the editor
      await scriptEditorContent.click();

      // Press Cmd+I (Mac) or Ctrl+I (Windows/Linux) to open AI assistant
      await page.keyboard.press('ControlOrMeta+i');

      // Verify AI assistant widget is visible
      const widget = page.locator('.cm-ai-assistant-widget');
      await expect(widget).toBeVisible();

      // Verify textarea is focused
      const textarea = widget.locator('.ai-widget-textarea');
      await expect(textarea).toBeFocused();
    });

    test('should close AI assistant with Escape key', async ({ page, scriptEditorContent }) => {
      // Focus the editor and open AI assistant
      await scriptEditorContent.click();
      await page.keyboard.press('ControlOrMeta+i');
      const widget = page.locator('.cm-ai-assistant-widget');
      await expect(widget).toBeVisible();

      // Press Escape to close
      await page.keyboard.press('Escape');
      await expect(widget).toBeHidden();
    });

    test.skip('should toggle AI assistant with repeated shortcut', async ({
      page,
      scriptEditorContent,
    }) => {
      // Focus the editor and open AI assistant
      await scriptEditorContent.click();
      await page.keyboard.press('ControlOrMeta+i');
      const widget = page.locator('.cm-ai-assistant-widget');
      await expect(widget).toBeVisible();

      // Focus the editor again (not the widget) before pressing the shortcut
      await scriptEditorContent.click();
      // Press shortcut again to close
      await page.keyboard.press('ControlOrMeta+i');
      await expect(widget).toBeHidden();
    });
  });

  test.describe('Mention autocomplete', () => {
    test('should show mention dropdown when typing @', async ({ page, scriptEditorContent }) => {
      // Focus the editor and open AI assistant
      await scriptEditorContent.click();
      await page.keyboard.press('ControlOrMeta+i');
      const widget = page.locator('.cm-ai-assistant-widget');
      const textarea = widget.locator('.ai-widget-textarea');

      // Type @ to trigger mention
      await textarea.type('@');

      // Verify dropdown appears
      const dropdown = page.locator('.ai-widget-mention-dropdown');
      await expect(dropdown).toBeVisible();

      // Verify aria attributes
      await expect(textarea).toHaveAttribute('aria-expanded', 'true');
      await expect(textarea).toHaveAttribute('aria-autocomplete', 'list');
      await expect(textarea).toHaveAttribute('aria-controls', /ai-mention-listbox-\d+/);
    });

    // Test removed as requested

    // Test removed as requested

    test('should insert selected mention on Enter', async ({ page, scriptEditorContent }) => {
      // Focus the editor and open AI assistant
      await scriptEditorContent.click();
      await page.keyboard.press('ControlOrMeta+i');
      const widget = page.locator('.cm-ai-assistant-widget');
      const textarea = widget.locator('.ai-widget-textarea');

      // Type @ to trigger mention
      await textarea.type('@');

      // Wait for dropdown
      const dropdown = page.locator('.ai-widget-mention-dropdown');
      await expect(dropdown).toBeVisible();

      // Wait for items to be visible
      await expect(dropdown.locator('.ai-widget-mention-item').first()).toBeVisible();

      // Press Enter to select first item
      await page.keyboard.press('Enter');

      // Dropdown should disappear
      await expect(dropdown).toBeHidden();

      // Textarea should contain the mention
      const value = await textarea.inputValue();
      expect(value).toMatch(/@\w+\s$/); // Should end with @word and space
    });

    test('should close mention dropdown on Escape', async ({ page, scriptEditorContent }) => {
      // Focus the editor and open AI assistant
      await scriptEditorContent.click();
      await page.keyboard.press('ControlOrMeta+i');
      const widget = page.locator('.cm-ai-assistant-widget');
      const textarea = widget.locator('.ai-widget-textarea');

      // Type @ to trigger mention
      await textarea.type('@');

      // Wait for dropdown
      const dropdown = page.locator('.ai-widget-mention-dropdown');
      await expect(dropdown).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');

      // Dropdown should disappear but widget should remain
      await expect(dropdown).toBeHidden();
      await expect(widget).toBeVisible();

      // aria-expanded should be false
      await expect(textarea).toHaveAttribute('aria-expanded', 'false');
    });
  });

  test.describe.skip('Prompt history', () => {
    test('should navigate prompt history with arrow keys', async ({
      page,
      scriptEditorContent,
    }) => {
      // Focus the editor and open AI assistant
      await scriptEditorContent.click();
      await page.keyboard.press('ControlOrMeta+i');
      const widget = page.locator('.cm-ai-assistant-widget');
      const textarea = widget.locator('.ai-widget-textarea');

      // Type and "submit" a few prompts (we'll just type them)
      const prompts = ['First prompt', 'Second prompt', 'Third prompt'];

      for (const prompt of prompts) {
        await textarea.fill(prompt);
        // Close and reopen to simulate submitting
        await page.keyboard.press('Escape');
        await page.keyboard.press('ControlOrMeta+i');
      }

      // Clear textarea
      await textarea.fill('');

      // Press up arrow to get last prompt
      await page.keyboard.press('ArrowUp');
      await expect(textarea).toHaveValue(prompts[2]);

      // Press up again to get second prompt
      await page.keyboard.press('ArrowUp');
      await expect(textarea).toHaveValue(prompts[1]);

      // Press down to go back
      await page.keyboard.press('ArrowDown');
      await expect(textarea).toHaveValue(prompts[2]);
    });
  });

  test.describe('Context display', () => {
    test('should show collapsible context section', async ({ page, scriptEditorContent }) => {
      // Add some SQL to the editor
      await scriptEditorContent.click();
      await page.keyboard.type('SELECT * FROM users;');

      // Open AI assistant
      await page.keyboard.press('ControlOrMeta+i');
      const widget = page.locator('.cm-ai-assistant-widget');

      // Check context section exists
      const contextSection = widget.locator('.ai-widget-combined-context');
      await expect(contextSection).toBeVisible();

      // Context should be collapsed by default
      const contextContent = contextSection.locator('.ai-widget-context-content');
      await expect(contextContent).toBeHidden();

      // Click to expand
      const contextHeader = contextSection.locator('.ai-widget-context-left');
      await contextHeader.click();

      // Content should now be visible
      await expect(contextContent).toBeVisible();

      // Should show SQL context
      const sqlContext = contextContent.locator('.ai-widget-context-code');
      await expect(sqlContext).toContainText('SELECT * FROM users;');
    });

    test('should show database schema indicator', async ({ page, scriptEditorContent }) => {
      // Focus the editor and open AI assistant
      await scriptEditorContent.click();
      await page.keyboard.press('ControlOrMeta+i');
      const widget = page.locator('.cm-ai-assistant-widget');

      // Expand context
      const contextHeader = widget.locator('.ai-widget-context-left');
      await contextHeader.click();

      // Check schema indicator
      const schemaIndicator = widget.locator('.ai-widget-schema-indicator');
      await expect(schemaIndicator).toBeVisible();

      // Should show schema status (either available or not available)
      await expect(schemaIndicator).toHaveText(/Available|Not available/);
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper ARIA labels', async ({ page, scriptEditorContent }) => {
      // Focus the editor and open AI assistant
      await scriptEditorContent.click();
      await page.keyboard.press('ControlOrMeta+i');
      const widget = page.locator('.cm-ai-assistant-widget');

      // Check textarea aria-label
      const textarea = widget.locator('.ai-widget-textarea');
      await expect(textarea).toHaveAttribute('aria-label', 'AI assistant input');

      // Check close button aria-label
      const closeBtn = widget.locator('.ai-widget-close');
      await expect(closeBtn).toHaveAttribute('aria-label', 'Close AI Assistant');

      // Check generate button aria-label
      const generateBtn = widget.locator('.ai-widget-generate');
      await expect(generateBtn).toHaveAttribute('aria-label', 'Generate AI assistance');
    });

    test('should have ARIA live region for announcements', async ({
      page,
      scriptEditorContent,
    }) => {
      // Focus the editor and open AI assistant
      await scriptEditorContent.click();
      await page.keyboard.press('ControlOrMeta+i');
      const widget = page.locator('.cm-ai-assistant-widget');

      // Check for live region
      const liveRegion = widget.locator('.ai-widget-live-region');
      await expect(liveRegion).toHaveAttribute('role', 'status');
      await expect(liveRegion).toHaveAttribute('aria-live', 'polite');
      await expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
    });
  });

  test.describe('Copy/paste functionality', () => {
    test('should allow copy and paste in textarea', async ({ page, scriptEditorContent }) => {
      // Focus the editor and open AI assistant
      await scriptEditorContent.click();
      await page.keyboard.press('ControlOrMeta+i');
      const widget = page.locator('.cm-ai-assistant-widget');
      const textarea = widget.locator('.ai-widget-textarea');

      // Type some text
      await textarea.type('Test text to copy');

      // Select all and copy
      await textarea.selectText();
      await page.keyboard.press('ControlOrMeta+c');

      // Clear and paste
      await textarea.fill('');
      await page.keyboard.press('ControlOrMeta+v');

      // Should have pasted text
      await expect(textarea).toHaveValue('Test text to copy');
    });
  });
});
