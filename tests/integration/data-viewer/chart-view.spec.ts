import { expect, mergeTests, Page } from '@playwright/test';

import { test as dataViewTest } from '../fixtures/data-view';
import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';

const test = mergeTests(baseTest, scriptExplorerTest, scriptEditorTest, dataViewTest);

// A source larger than one data-view page (100 rows) keeps the main reader
// open and non-exhausted after the first page — the precondition for the chart
// aggregation reset/refetch loop. The chart aggregation pauses+resets that
// reader; reacting to the resulting `isStale` toggle used to re-trigger the
// chart, looping forever (blanking and re-rendering). These tests prove the
// chart settles and that pausing the reader does not break table paging.
const LARGE_SOURCE_QUERY =
  'SELECT (i % 5)::VARCHAR AS category, i AS amount FROM range(0, 500) AS t(i);';

const switchViewMode = async (page: Page, mode: 'Table' | 'Chart') => {
  await page.locator('[aria-label="Data view mode"]').getByText(mode, { exact: true }).click();
};

const selectChartColumn = async (page: Page, placeholder: 'X-Axis' | 'Y-Axis', column: string) => {
  await page.getByPlaceholder(placeholder).click();
  await page.getByRole('option', { name: column, exact: true }).click();
};

test.describe('Chart view', () => {
  test('renders and stays settled for a non-exhausted source (no aggregate loop)', async ({
    page,
    createScriptAndSwitchToItsTab,
    fillScript,
    runScript,
    waitForDataTable,
  }) => {
    await createScriptAndSwitchToItsTab();
    await fillScript(LARGE_SOURCE_QUERY);
    await runScript();
    await waitForDataTable();

    await switchViewMode(page, 'Chart');
    await selectChartColumn(page, 'X-Axis', 'category');
    await selectChartColumn(page, 'Y-Axis', 'amount');

    // The chart renders only when aggregation returned data, so a visible
    // surface proves the aggregate ran successfully on the pinned connection.
    const surface = page.locator('.recharts-surface').first();
    await expect(surface).toBeVisible({ timeout: 15000 });

    // Count how often the chart surface is (re)mounted over a settle window.
    // Each loop iteration flips `isLoading`, swapping the chart out for the
    // loading state and back, which re-inserts the surface. A settled chart
    // produces no further insertions; a looping one produces many (hundreds).
    const remounts = await page.evaluate(async () => {
      let count = 0;
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          record.addedNodes.forEach((node) => {
            if (
              node instanceof Element &&
              (node.classList.contains('recharts-surface') ||
                node.querySelector?.('.recharts-surface'))
            ) {
              count += 1;
            }
          });
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });
      observer.disconnect();
      return count;
    });

    expect(remounts).toBeLessThan(3);
    await expect(page.locator('.recharts-surface').first()).toBeVisible();
  });

  test('keeps the data table paginable after viewing a chart', async ({
    page,
    createScriptAndSwitchToItsTab,
    fillScript,
    runScript,
    waitForDataTable,
    dataTable,
  }) => {
    await createScriptAndSwitchToItsTab();
    await fillScript(LARGE_SOURCE_QUERY);
    await runScript();
    await waitForDataTable();

    await switchViewMode(page, 'Chart');
    await selectChartColumn(page, 'X-Axis', 'category');
    await selectChartColumn(page, 'Y-Axis', 'amount');
    await expect(page.locator('.recharts-surface').first()).toBeVisible({ timeout: 15000 });

    // Switching back to the table must still show data: the aggregate paused
    // the main reader, and the fix restores it so paging keeps working.
    await switchViewMode(page, 'Table');
    await waitForDataTable();
    await expect(
      dataTable.locator('[data-testid^="data-table-cell-value-"]').first(),
    ).toBeVisible();
  });
});
