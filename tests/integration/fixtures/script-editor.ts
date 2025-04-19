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
      await expect(page.getByText('Script ran successfully')).toBeVisible();
    });
  },
});
