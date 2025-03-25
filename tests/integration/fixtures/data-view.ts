import { test as base, expect, Locator } from '@playwright/test';

type DataViewFixtures = {
  /**
   * Wait for pagination control to be visible and return it.
   */
  waitForPaginationControl: () => Promise<Locator>;
};

export const test = base.extend<DataViewFixtures>({
  waitForPaginationControl: async ({ page }, use) => {
    await use(async () => {
      const paginationControl = page.getByTestId('data-table-pagination-control');

      expect(paginationControl).toBeVisible();
      return paginationControl;
    });
  },
});
