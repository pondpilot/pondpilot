import { test as base, expect } from '@playwright/test';
import { GET_TABLE_WITH_SPECIAL_CHARS_COLUMNS } from './consts';

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

const test = base.extend<QueryFixture>({
  createQueryAndSwitchToItsTab: async ({ page }, use) => {
    await use(async () => {
      await page.click('data-testid=add-query-button');
      await page.waitForTimeout(500);
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

  renameQueryInExplorer: async ({ page }, use) => {
    await use(async (oldName: string, newName: string) => {
      // Find the query item in the explorer
      const queryItem = page.locator(`[data-testid="query-list-item-${oldName}"]`);

      // Double-click to initiate rename
      await queryItem.dblclick();

      // Find and fill the rename input
      const renameInput = page.locator(`[data-testid="query-list-item-${oldName}-rename-input"]`);

      await expect(renameInput).toBeVisible();

      await renameInput.fill(newName);

      // Press Enter to confirm
      await page.keyboard.press('Enter');

      // Wait for the renamed query to appear
      await page.waitForSelector(`[data-testid="query-list-item-${newName}.sql"]`);
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
  await page.waitForSelector('data-testid=result-table', { state: 'visible' });

  // Get all header cells
  const headerCells = page.locator('data-testid=thead-cell');
  const headerCount = await headerCells.count();

  // Verify we have header cells
  expect(headerCount).toBeGreaterThan(0);

  // For each header cell, check if its width matches the corresponding data cell
  for (let i = 0; i < headerCount; i += 1) {
    // Get the current header cell
    const headerCell = headerCells.nth(i);
    await expect(headerCell).toBeVisible();

    // Get the corresponding data cell in the first row
    const dataCell = page.locator(`data-testid=table-cell >> nth=${i}`);
    await expect(dataCell).toBeVisible();

    // Get bounding boxes for both cells
    const headerBoundingBox = await headerCell.boundingBox();
    const dataBoundingBox = await dataCell.boundingBox();

    // Check that the width of the header cell is equal to the width of the data cell
    expect(headerBoundingBox?.width).toBeCloseTo(dataBoundingBox?.width as number, 1);
  }
});

test('Long query names are truncated in spotlight results', async ({
  createQueryAndSwitchToItsTab,
  fillQuery,
  renameQueryInExplorer,
  page,
}) => {
  // Create a new query
  await createQueryAndSwitchToItsTab();
  await fillQuery('select 1');

  const longQueryName =
    'ThisIsAVeryLongQueryNameThatShouldBeTruncatedInTheSpotlightSearchResults123';
  expect(longQueryName.length).toBe(75);

  // Rename the query
  await renameQueryInExplorer('query.sql', longQueryName);

  await page.waitForTimeout(500);

  // проверить, что в редакторе есть текст
  expect(await page.locator('.cm-content').textContent()).toContain('select 1');

  // Verify the renamed query appears
  const renamedQueryItem = page.locator(`[data-testid="query-list-item-${longQueryName}.sql"]`);
  await expect(renamedQueryItem).toBeVisible();

  // Verify the old query disappeared
  await expect(page.locator('[data-testid="query-list-item-query.sql"]')).not.toBeVisible();

  // Open spotlight menu
  await page.click('data-testid=spotlight-trigger-input');

  // Type part of the name in spotlight search
  await page.fill('[data-testid=spotlight-search]', 'ThisIs');

  // Find the query in search results by its data-testid
  const spotlightQueryItem = page.locator(`[data-testid="${longQueryName}.sql"]`);
  await expect(spotlightQueryItem).toBeVisible();

  // Check that the text is truncated with ellipsis
  const queryNamePTag = spotlightQueryItem.locator('p');
  await expect(queryNamePTag).toBeVisible();

  // Check if text is truncated with ellipsis
  const isTruncatedWithEllipsis = await queryNamePTag.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const hasEllipsis = style.textOverflow === 'ellipsis';
    const isOverflowing = element.scrollWidth > element.clientWidth;

    return hasEllipsis && isOverflowing;
  });

  // Assert that the text is properly truncated
  expect(isTruncatedWithEllipsis).toBeTruthy();
});
