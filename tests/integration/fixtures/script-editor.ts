import { test as base, expect, Locator } from '@playwright/test';

type ScriptEditorFixtures = {
  /**
   * Returns the script editor locator.
   */
  scriptEditor: Locator;

  /**
   * Returns the script editor textbox locator.
   */
  scriptEditorContent: Locator;

  /**
   * Returns the "Run" [script] button locator.
   */
  runScriptButton: Locator;

  /**
   * Returns the active Script editor locator.
   */
  activeScriptEditor: Locator;

  getScriptEditorContent: (baseLocator?: Locator) => Promise<Locator>;
  fillScript: (content: string) => Promise<void>;
  runScript: () => Promise<void>;

  /**
   * Press the keyboard shortcut to copy (Ctrl+C)
   */
  pressCopyHotkey: () => Promise<void>;

  /**
   * Press the keyboard shortcut to paste (Ctrl+V)
   */
  pressPasteHotkey: () => Promise<void>;

  /**
   * Runs the script using the keyboard shortcut (Ctrl+Enter)
   */
  runScriptWithHotkey: () => Promise<void>;

  /**
   * Puts cursor on a given line and runs it using the keyboard shortcut (Ctrl+Shift+Enter)
   * @param line - The line number to run
   */
  runSelectionWithHotkey: (line: number) => Promise<void>;

  /**
   * Opens the version history modal if the button is visible
   */
  openVersionHistory: () => Promise<void>;
};

const QUERY_EDITOR_TIMEOUT = Number(process.env.PLAYWRIGHT_QUERY_EDITOR_TIMEOUT) || 100;

export const test = base.extend<ScriptEditorFixtures>({
  scriptEditor: async ({ page }, use) => {
    await use(page.getByTestId('query-editor'));
  },

  scriptEditorContent: async ({ activeScriptEditor }, use) => {
    await use(activeScriptEditor.locator('.cm-content'));
  },

  runScriptButton: async ({ activeScriptEditor }, use) => {
    await use(activeScriptEditor.getByTestId('run-query-button'));
  },

  activeScriptEditor: async ({ page }, use) => {
    await use(page.locator('[data-active-editor="true"]'));
  },

  getScriptEditorContent: async ({ activeScriptEditor }, use) => {
    await use(async (baseLocator?: Locator) => {
      const activeEditor = baseLocator || activeScriptEditor;
      const editorContent = activeEditor.locator('.cm-content');
      await expect(editorContent).toBeVisible({ timeout: QUERY_EDITOR_TIMEOUT });
      return editorContent;
    });
  },

  fillScript: async ({ activeScriptEditor, scriptEditorContent }, use) => {
    await use(async (content: string) => {
      // Verify the script tab is active
      await expect(
        activeScriptEditor,
        'Did you forget to open a script tab before calling this fixture? Use `createScriptAndSwitchToItsTab` or similar fixture first',
      ).toBeVisible({ timeout: QUERY_EDITOR_TIMEOUT });

      await scriptEditorContent.fill(content);
      await expect(scriptEditorContent).toContainText(content);
    });
  },

  runScript: async ({ page, activeScriptEditor, runScriptButton }, use) => {
    await use(async () => {
      // Verify the script tab is active
      await expect(
        activeScriptEditor,
        'Did you forget to open a script tab before calling this fixture? Use `createScriptAndSwitchToItsTab` or similar fixture first',
      ).toBeVisible({ timeout: QUERY_EDITOR_TIMEOUT });

      await runScriptButton.click();
      await expect(page.getByText('Query ran successfully')).toBeVisible();
    });
  },

  pressCopyHotkey: async ({ page }, use) => {
    await use(async () => {
      await page.keyboard.press('Control+KeyC');
    });
  },

  pressPasteHotkey: async ({ page }, use) => {
    await use(async () => {
      await page.keyboard.press('Control+KeyV');
    });
  },

  runScriptWithHotkey: async ({ page, activeScriptEditor }, use) => {
    await use(async () => {
      // Verify the script tab is active
      await expect(
        activeScriptEditor,
        'Did you forget to open a script tab before calling this fixture? Use `createScriptAndSwitchToItsTab` or similar fixture first',
      ).toBeVisible({ timeout: QUERY_EDITOR_TIMEOUT });

      // Focus the editor
      await activeScriptEditor.click();

      // Use Ctrl+Enter to run the script
      await page.keyboard.press('Control+Enter');

      await expect(page.getByText('Query ran successfully')).toBeVisible();
    });
  },

  runSelectionWithHotkey: async ({ page, activeScriptEditor, scriptEditorContent }, use) => {
    await use(async (line: number) => {
      // Verify the script tab is active
      await expect(
        activeScriptEditor,
        'Did you forget to open a script tab before calling this fixture? Use `createScriptAndSwitchToItsTab` or similar fixture first',
      ).toBeVisible({ timeout: QUERY_EDITOR_TIMEOUT });

      // Focus the editor
      await activeScriptEditor.click();

      // Find n-th line and select it
      const lineLocator = scriptEditorContent.locator(`.cm-line:nth-child(${line})`);
      await lineLocator.click();
      // Move to the end of the line
      await page.keyboard.press('ControlOrMeta+ArrowRight');

      // Use Ctrl+Shift+Enter to run the selection
      await page.keyboard.press('Control+Shift+Enter');

      await expect(page.getByText('Query ran successfully')).toBeVisible();
    });
  },

  openVersionHistory: async ({ page, activeScriptEditor }, use) => {
    await use(async () => {
      // Verify the script tab is active
      await expect(
        activeScriptEditor,
        'Did you forget to open a script tab before calling this fixture?',
      ).toBeVisible({ timeout: QUERY_EDITOR_TIMEOUT });

      const versionHistoryButton = activeScriptEditor.getByTestId('version-history-button');
      const isVisible = await versionHistoryButton.isVisible();

      if (isVisible) {
        await versionHistoryButton.click();
        // Wait for modal to appear
        await page.waitForSelector('[data-testid="version-history-modal"]', { state: 'visible' });
      }
    });
  },
});
