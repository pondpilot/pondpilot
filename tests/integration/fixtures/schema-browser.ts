import { test as base, expect, Locator } from '@playwright/test';

type SchemaBrowserFixtures = {
  /**
   * Schema browser canvas locator
   */
  schemaBrowserCanvas: Locator;

  /**
   * Schema controls panel locator
   */
  schemaControls: Locator;

  /**
   * Schema direction control locator
   */
  schemaDirectionControl: Locator;

  /**
   * Schema refresh button locator
   */
  schemaRefreshButton: Locator;

  /**
   * Wait for schema browser to finish loading
   */
  waitForSchemaLoaded: () => Promise<void>;

  /**
   * Get table node by table name
   */
  getSchemaTableNode: (tableName: string) => Locator;

  /**
   * Assert that schema browser has loaded with expected table count
   */
  assertSchemaBrowserLoaded: (expectedTableCount?: number) => Promise<void>;

  /**
   * Switch schema browser layout direction
   */
  toggleSchemaDirection: () => Promise<void>;

  /**
   * Refresh schema browser
   */
  refreshSchema: () => Promise<void>;

  /**
   * Assert table node is visible and contains expected columns
   */
  assertTableNodeContent: (tableName: string, expectedColumns: string[]) => Promise<void>;

  /**
   * Click on a table node to highlight it
   */
  clickTableNode: (tableName: string) => Promise<void>;

  /**
   * Assert table node is highlighted
   */
  assertTableNodeHighlighted: (tableName: string) => Promise<void>;
};

export const test = base.extend<SchemaBrowserFixtures>({
  schemaBrowserCanvas: async ({ page }, use) => {
    const locator = page.locator('[data-testid="schema-browser-canvas"]');
    await use(locator);
  },

  schemaControls: async ({ page }, use) => {
    const locator = page.locator('[data-testid="schema-controls"]');
    await use(locator);
  },

  schemaDirectionControl: async ({ page }, use) => {
    const locator = page.locator('[data-testid="schema-direction-control"]');
    await use(locator);
  },

  schemaRefreshButton: async ({ page }, use) => {
    const locator = page.locator('[data-testid="schema-refresh-button"]');
    await use(locator);
  },

  // Removed openSchemaBrowser - will use getDBNodeByName from db-explorer fixture instead

  waitForSchemaLoaded: async ({ page }, use) => {
    const waitForSchemaLoaded = async () => {
      // Wait for the schema browser tab to be visible and active
      await page.waitForTimeout(2000); // Give time for tab creation

      // Look for the React Flow container within the schema browser
      const reactFlowContainer = page.locator('.react-flow').first();

      try {
        await reactFlowContainer.waitFor({
          state: 'visible',
          timeout: 15000,
        });
      } catch {
        // If react-flow not found, try the schema browser canvas directly
        const canvas = page.locator('[data-testid="schema-browser-canvas"]');
        await canvas.waitFor({
          state: 'visible',
          timeout: 15000,
        });
      }

      // Wait for any loading spinners to disappear
      await page
        .waitForSelector('.mantine-Loader-root', { state: 'detached', timeout: 10000 })
        .catch(() => {
          // Loading spinner might not appear if data loads quickly
        });

      // Wait for React Flow to be fully initialized
      await page.waitForFunction(
        () => {
          const reactFlowEl = document.querySelector('.react-flow');
          return reactFlowEl && reactFlowEl.querySelector('.react-flow__nodes');
        },
        { timeout: 10000 },
      );

      // Wait for at least one node to be rendered
      const nodeSelector = '.react-flow__node, [data-testid*="schema-table-node"]';
      await page.waitForSelector(nodeSelector, { state: 'visible', timeout: 10000 });

      // Wait a bit more for layout calculations and animations
      await page.waitForTimeout(2000);
    };
    await use(waitForSchemaLoaded);
  },

  getSchemaTableNode: async ({ page }, use) => {
    const getSchemaTableNode = (tableName: string) => {
      // Use react-flow nodes and filter by text content
      return page.locator('.react-flow__node').filter({ hasText: tableName }).first();
    };
    await use(getSchemaTableNode);
  },

  assertSchemaBrowserLoaded: async ({ page, schemaBrowserCanvas }, use) => {
    const assertSchemaBrowserLoaded = async (expectedTableCount?: number) => {
      // Assert canvas is visible
      await expect(schemaBrowserCanvas).toBeVisible();

      // If expected table count provided, assert it
      if (expectedTableCount !== undefined) {
        // Use react-flow nodes as primary indicator
        const reactFlowNodes = page.locator('.react-flow__node');
        await expect(reactFlowNodes).toHaveCount(expectedTableCount);
      }
    };
    await use(assertSchemaBrowserLoaded);
  },

  toggleSchemaDirection: async ({ page, schemaDirectionControl }, use) => {
    const toggleSchemaDirection = async () => {
      // Find the button/label that is not currently active
      // The SegmentedControl has labels inside the control elements
      const controls = schemaDirectionControl.locator('.mantine-SegmentedControl-control');
      const activeControl = controls.filter({ has: page.locator('[data-active="true"]') }).first();
      const activeIndex = await controls.evaluateAll((els, activeEl) => {
        const activeElement = els.find((el) => el.querySelector('[data-active="true"]'));
        return els.indexOf(activeElement!);
      });

      // Click the other option (if active is 0, click 1; if active is 1, click 0)
      const targetIndex = activeIndex === 0 ? 1 : 0;
      await controls.nth(targetIndex).click();

      // Wait for layout to update
      await new Promise((resolve) => setTimeout(resolve, 1000));
    };
    await use(toggleSchemaDirection);
  },

  refreshSchema: async ({ schemaRefreshButton }, use) => {
    const refreshSchema = async () => {
      await schemaRefreshButton.click();

      // Wait for refresh to complete
      await schemaRefreshButton.waitFor({ state: 'visible' });
      await new Promise((resolve) => setTimeout(resolve, 500));
    };
    await use(refreshSchema);
  },

  assertTableNodeContent: async ({ page }, use) => {
    const assertTableNodeContent = async (tableName: string, expectedColumns: string[]) => {
      // Wait a bit for the schema to fully render
      await page.waitForTimeout(2000);

      // First, check if any React Flow nodes exist
      const anyNode = page.locator('.react-flow__node').first();
      try {
        await expect(anyNode).toBeVisible({ timeout: 5000 });
      } catch {
        // If no React Flow nodes, try the data-testid approach
        const testIdNode = page.locator('[data-testid*="schema-table-node"]').first();
        await expect(testIdNode).toBeVisible({ timeout: 5000 });
      }

      // Find the table node by its label - look for exact matches in the header
      // Use a more specific selector to find the table by its header text
      let tableNode = page
        .locator('.react-flow__node')
        .filter({
          has: page
            .locator('.text-sm.font-semibold')
            .filter({ hasText: new RegExp(`^${tableName}$`) }),
        })
        .first();

      // Check if the node is visible
      const isVisible = await tableNode.isVisible().catch(() => false);

      if (!isVisible) {
        // Fallback to general text filter
        tableNode = page.locator('.react-flow__node').filter({ hasText: tableName }).first();
      }

      if (!(await tableNode.isVisible().catch(() => false))) {
        // Try with data-testid as last resort
        tableNode = page.locator(`[data-testid*="${tableName}"]`).first();
      }

      // Wait for the table node to be visible
      await expect(tableNode).toBeVisible({ timeout: 10000 });

      // Check each expected column is present
      for (const columnName of expectedColumns) {
        // Look for column name within the table node
        const columnLocator = tableNode.locator(`text="${columnName}"`).first();
        try {
          await expect(columnLocator).toBeVisible({ timeout: 5000 });
        } catch (error) {
          // If not found, provide more helpful debugging info
          const tableContent = await tableNode.textContent();
          throw new Error(
            `Column "${columnName}" not found in table "${tableName}". Table content: ${tableContent}`,
          );
        }
      }
    };
    await use(assertTableNodeContent);
  },

  clickTableNode: async ({ page }, use) => {
    const clickTableNode = async (tableName: string) => {
      const tableNode = page.locator('.react-flow__node').filter({ hasText: tableName }).first();
      await tableNode.click();
    };
    await use(clickTableNode);
  },

  assertTableNodeHighlighted: async ({ page }, use) => {
    const assertTableNodeHighlighted = async (tableName: string) => {
      const tableNode = page.locator('.react-flow__node').filter({ hasText: tableName }).first();

      // Check if node has highlighted styling (blue border)
      await expect(tableNode.locator('.border-blue-500')).toBeVisible();
    };
    await use(assertTableNodeHighlighted);
  },
});

export { expect } from '@playwright/test';
