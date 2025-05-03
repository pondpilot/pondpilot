import { test as base } from '@playwright/test';

type GlobalHotkeyFixtures = {
  /**
   * Press the keyboard shortcut to open spotlight menu (Ctrl+K)
   */
  pressSpotlightHotkey: () => Promise<void>;

  /**
   * Press the keyboard shortcut to create a new script (Alt+N)
   */
  pressNewScriptHotkey: () => Promise<void>;

  /**
   * Press the keyboard shortcut to add a file (Ctrl+F)
   */
  pressAddFileHotkey: () => Promise<void>;

  /**
   * Press the keyboard shortcut to add a DuckDB file (Ctrl+D)
   */
  pressAddDuckDBHotkey: () => Promise<void>;

  /**
   * Press the keyboard shortcut to import SQL files (Ctrl+I)
   */
  pressImportSQLHotkey: () => Promise<void>;

  /**
   * Press the keyboard shortcut to add a folder (Alt+Mod+F)
   */
  pressAddFolderHotkey: () => Promise<void>;
};

export const test = base.extend<GlobalHotkeyFixtures>({
  pressSpotlightHotkey: async ({ page }, use) => {
    await use(async () => {
      await page.keyboard.press('ControlOrMeta+KeyK');
    });
  },

  pressNewScriptHotkey: async ({ page }, use) => {
    await use(async () => {
      await page.keyboard.press('Control+KeyN');
    });
  },

  pressAddFileHotkey: async ({ page }, use) => {
    await use(async () => {
      await page.keyboard.press('ControlOrMeta+KeyF');
    });
  },

  pressAddDuckDBHotkey: async ({ page }, use) => {
    await use(async () => {
      await page.keyboard.press('ControlOrMeta+KeyD');
    });
  },

  pressImportSQLHotkey: async ({ page }, use) => {
    await use(async () => {
      await page.keyboard.press('ControlOrMeta+KeyI');
    });
  },

  pressAddFolderHotkey: async ({ page }, use) => {
    await use(async () => {
      await page.keyboard.press('Alt+ControlOrMeta+KeyF');
    });
  },
});
