import { Page } from '@playwright/test';

export const pressPrimaryShortcut = async (page: Page, key: string) => {
  await page.keyboard.press(`ControlOrMeta+${key.toLowerCase()}`);
};
