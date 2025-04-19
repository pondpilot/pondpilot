import { test as base } from '@playwright/test';

type TabFixtures = {
  switchToTab: (tabName: string) => Promise<void>;
  closeActiveTab: () => Promise<void>;
};

export const test = base.extend<TabFixtures>({
  switchToTab: async ({ page }, use) => {
    await use(async (tabName: string) => {
      const tabsList = page.getByTestId('tabs-list');
      const tab = tabsList.getByText(tabName, { exact: true });
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
