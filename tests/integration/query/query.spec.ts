import { expect } from '@playwright/test';
import { GET_TABLE_WITH_SPECIAL_CHARS_COLUMNS } from './consts';
import { baseTest } from '../baseTest';

type QueryFixture = {
  createQueryAndSwitchToItsTab: () => Promise<void>;
  fillQuery: (content: string) => Promise<void>;
  runQuery: () => Promise<void>;
  switchToTab: (tabName: string) => Promise<void>;
  closeActiveTab: () => Promise<void>;
  openQueryFromExplorer: (queryName: string) => Promise<void>;
  createQueryViaSpotlight: () => Promise<void>;
  renameQueryInExplorer: (oldName: string, newName: string) => Promise<void>;
};

const test = baseTest.extend<QueryFixture>({
  createQueryAndSwitchToItsTab: async ({ page }, use) => {
    await use(async () => {
      await page.getByTestId('add-query-button').click();
      await page.waitForTimeout(500);
    });
  },

  createQueryViaSpotlight: async ({ page }, use) => {
    await use(async () => {
      // Open spotlight menu using trigger
      await page.getByTestId('spotlight-trigger-input').click();

      // Verify spotlight is visible
      const spotlightRoot = page.getByTestId('spotlight-menu');
      await expect(spotlightRoot).toBeVisible();

      // Create new query through spotlight
      await spotlightRoot.getByTestId('spotlight-action-create-new-query').click();

      // Verify spotlight is closed after creating query
      await expect(spotlightRoot).not.toBeVisible();
    });
  },

  fillQuery: async ({ page }, use) => {
    await use(async (content: string) => {
      await page.fill('.cm-content', content);
      await expect(page.locator('.cm-content')).toContainText(content);
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
      const tabsList = page.getByTestId('tabs-list');
      const tab = tabsList.getByText(tabName);
      await tab.click();
    });
  },

  closeActiveTab: async ({ page }, use) => {
    await use(async () => {
      const activeTab = page.locator('[data-active="true"]');
      await activeTab.getByTestId('close-tab-button').click();
    });
  },

  openQueryFromExplorer: async ({ page }, use) => {
    await use(async (queryName: string) => {
      const queriesList = page.locator('#queries-list');
      const queryItem = queriesList.locator('p', { hasText: queryName });
      await queryItem.click();
    });
  },

  renameQueryInExplorer: async ({ page }, use) => {
    await use(async (oldName: string, newName: string) => {
      // Find the query item in the explorer
      const queryItem = page.getByTestId(`query-list-item-${oldName}`);

      // Double-click to initiate rename
      await queryItem.dblclick();

      // Find and fill the rename input
      const renameInput = page.getByTestId(`query-list-item-${oldName}-rename-input`);

      await expect(renameInput).toBeVisible();

      await renameInput.fill(newName);

      // Press Enter to confirm
      await page.keyboard.press('Enter');

      // Wait for the renamed query to appear
      await page.getByTestId(`query-list-item-${newName}.sql`).waitFor();
    });
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

test('Autocomplete converts keywords to uppercase', async ({
  createQueryAndSwitchToItsTab,
  page,
}) => {
  await createQueryAndSwitchToItsTab();

  // Type 'select' in the editor
  const editor = page.locator('.cm-content');
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

test('Header cell width matches data cell width for special character columns', async ({
  createQueryAndSwitchToItsTab,
  fillQuery,
  runQuery,
  page,
}) => {
  // Create a new query
  await createQueryAndSwitchToItsTab();
  // Fill the query with the special character columns query
  await fillQuery(GET_TABLE_WITH_SPECIAL_CHARS_COLUMNS);
  // Run the query
  await runQuery();
  // Wait for table to be fully rendered
  await page.getByTestId('result-table').waitFor({ state: 'visible' });

  // Get all header cells
  const headerCells = page.getByTestId('thead-cell');
  const headerCount = await headerCells.count();

  // Verify we have header cells
  expect(headerCount).toBeGreaterThan(0);

  // For each header cell, check if its width matches the corresponding data cell
  for (let i = 0; i < headerCount; i += 1) {
    // Get the current header cell
    const headerCell = headerCells.nth(i);
    await expect(headerCell).toBeVisible();

    // Get the corresponding data cell in the first row
    const dataCell = page.getByTestId('table-cell').nth(i);
    await expect(dataCell).toBeVisible();

    // Get bounding boxes for both cells
    const headerBoundingBox = await headerCell.boundingBox();
    const dataBoundingBox = await dataCell.boundingBox();

    // Check that the width of the header cell is equal to the width of the data cell
    expect(headerBoundingBox?.width).toBeCloseTo(dataBoundingBox?.width as number, 1);
  }
});
