import { test as base, expect } from '@playwright/test';

type QueryFixture = {
  createQueryAndSwitchToItsTab: () => Promise<void>;
  fillQuery: (content: string) => Promise<void>;
  runQuery: () => Promise<void>;
  switchToTab: (tabName: string) => Promise<void>;
  closeActiveTab: () => Promise<void>;
  openQueryFromExplorer: (queryName: string) => Promise<void>;
  createQueryViaSpotlight: () => Promise<void>;
};

const test = base.extend<QueryFixture>({
  createQueryAndSwitchToItsTab: async ({ page }, use) => {
    await use(async () => {
      await page.click('data-testid=add-query-button');
    });
  },

  createQueryViaSpotlight: async ({ page }, use) => {
    await use(async () => {
      // Open spotlight menu using trigger
      await page.click('data-testid=spotlight-trigger-input');

      // Verify spotlight is visible
      const spotlightRoot = page.locator('data-testid=spotlight-menu');
      await expect(spotlightRoot).toBeVisible();

      // Create new query through spotlight
      await spotlightRoot.locator('data-testid=create-new-query').click();

      // Verify spotlight is closed after creating query
      await expect(spotlightRoot).not.toBeVisible();
    });
  },

  fillQuery: async ({ page }, use) => {
    await use(async (content: string) => {
      await page.fill('.cm-content', content);
    });
  },

  runQuery: async ({ page }, use) => {
    await use(async () => {
      await page.click('data-testid=run-query-button');
      await expect(page.getByText('Query ran successfully')).toBeVisible();
    });
  },

  switchToTab: async ({ page }, use) => {
    await use(async (tabName: string) => {
      const tabsList = page.locator('[data-testid="tabs-list"]');
      const tab = tabsList.getByText(tabName);
      await tab.click();
    });
  },

  closeActiveTab: async ({ page }, use) => {
    await use(async () => {
      const activeTab = page.locator('[data-active="true"]');
      await activeTab.locator('[data-testid="close-tab-button"]').click();
    });
  },

  openQueryFromExplorer: async ({ page }, use) => {
    await use(async (queryName: string) => {
      const queriesList = page.locator('#queries-list');
      const queryItem = queriesList.locator('p', { hasText: queryName });
      await queryItem.click();
    });
  },

  page: async ({ page }, use) => {
    // ---------- BEFORE EACH TEST ----------
    await page.goto('http://localhost:5173/');
    await page.waitForSelector('[data-app-ready="true"]', { state: 'attached' });
    await use(page);
  },
});

test('Create and run simple query', async ({
  createQueryAndSwitchToItsTab,
  fillQuery,
  runQuery,
  page,
}) => {
  await createQueryAndSwitchToItsTab();
  await fillQuery('select 1');
  await runQuery();
  await expect(page.getByTestId('cell-1-0')).toHaveText('1');
});

test('Close and reopen query', async ({
  createQueryAndSwitchToItsTab,
  fillQuery,
  closeActiveTab,
  openQueryFromExplorer,
  page,
}) => {
  await createQueryAndSwitchToItsTab();
  await fillQuery('select 1');
  await closeActiveTab();
  await openQueryFromExplorer('query.sql');
  await expect(page.locator('.cm-content')).toContainText('select 1');
});

test('Switch between tabs using tabs pane', async ({
  createQueryAndSwitchToItsTab,
  fillQuery,
  switchToTab,
  page,
}) => {
  await createQueryAndSwitchToItsTab();
  await fillQuery('select 1');
  await createQueryAndSwitchToItsTab();
  await expect(page.locator('.cm-content')).toContainText('');
  await switchToTab('query.sql');
  await expect(page.locator('.cm-content')).toContainText('select 1');
});

test('Switch between tabs using query explorer', async ({
  createQueryAndSwitchToItsTab,
  fillQuery,
  openQueryFromExplorer,
  page,
}) => {
  await createQueryAndSwitchToItsTab();
  await fillQuery('select 1');
  await createQueryAndSwitchToItsTab();
  await expect(page.locator('.cm-content')).toContainText('');
  await openQueryFromExplorer('query.sql');
  await expect(page.locator('.cm-content')).toContainText('select 1');
});

test('Create two queries with different content and switch between them', async ({
  createQueryAndSwitchToItsTab,
  fillQuery,
  switchToTab,
  page,
}) => {
  // Create and fill first query
  await createQueryAndSwitchToItsTab();
  await fillQuery('select 1 as first_query');

  // Create and fill second query
  await createQueryAndSwitchToItsTab();
  await fillQuery('select 2 as second_query');

  // Switch back to first query and verify content
  await switchToTab('query.sql');
  await expect(page.locator('.cm-content')).toContainText('select 1 as first_query');

  // Switch back to second query and verify content
  await switchToTab('query_1.sql');
  await expect(page.locator('.cm-content')).toContainText('select 2 as second_query');
});

test('Create queries using spotlight menu', async ({
  createQueryViaSpotlight,
  fillQuery,
  switchToTab,
  page,
}) => {
  // Create first query via spotlight
  await createQueryViaSpotlight();
  await fillQuery('select 3 as spotlight_query_1');

  // Create second query via spotlight
  await createQueryViaSpotlight();
  await fillQuery('select 4 as spotlight_query_2');

  // Switch to first query and verify content
  await switchToTab('query.sql');
  await expect(page.locator('.cm-content')).toContainText('select 3 as spotlight_query_1');

  // Switch to second query and verify content
  await switchToTab('query_1.sql');
  await expect(page.locator('.cm-content')).toContainText('select 4 as spotlight_query_2');
});
