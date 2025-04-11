import { test as base } from '@playwright/test';

type TabFixtures = {
  createQueryAndSwitchToItsTab: () => Promise<void>;
  switchToTab: (tabName: string) => Promise<void>;
  closeActiveTab: () => Promise<void>;
};

export const test = base.extend<TabFixtures>({
  createQueryAndSwitchToItsTab: async ({ page }, use) => {
    await use(async () => {
      await page.getByTestId('add-query-button').click();
      await page.waitForTimeout(500);
    });
  },

  switchToTab: async ({ page }, use) => {
    await use(async (tabName: string) => {
      const tabsList = page.getByTestId('tabs-list');
      const tab = tabsList.getByText(tabName);
      await tab.click();
    });
  },

  closeActiveTab: async ({ page }, use) => {
    await use(async () => {
      const activeTab = page.locator('[data-tab-handle-active="true"]');
      await activeTab.getByTestId('close-tab-button').click();
    });
  },
});
