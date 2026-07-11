import { expect, mergeTests } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { test as filePickerTest } from '../fixtures/file-picker';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as baseTest } from '../fixtures/page';
import { test as waitUtilsTest } from '../fixtures/wait-utils';
import { FileSystemNode } from '../models';

const test = mergeTests(baseTest, filePickerTest, fileSystemExplorerTest, waitUtilsTest);

const sourceFiles: FileSystemNode[] = [
  {
    type: 'file',
    ext: 'csv',
    name: 'source_a',
    content: [
      'id,name,score,legacy',
      '1,Alice,10,alpha',
      '2,Bob,20,beta',
      '3,Carol,30,gamma',
      '4,Dan,40,delta',
    ].join('\n'),
  },
  {
    type: 'file',
    ext: 'csv',
    name: 'source_b',
    content: [
      'id,name,score,current',
      '1,Alice,10,one',
      '2,Bobby,20,two',
      '3,Carol,35,three',
      '5,Eve,50,five',
    ].join('\n'),
  },
];

const createComparisonFromSelectedFiles = async (
  page: Page,
  selectMultipleFileNodes: (indices: number[]) => Promise<Locator[]>,
) => {
  const selectedNodes = await selectMultipleFileNodes([0, 1]);
  const firstSelectedNode = selectedNodes[0];

  await firstSelectedNode.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Compare', exact: true }).click();
  await expect(page.getByText('Schema Comparison', { exact: true })).toBeVisible();
};

const runComparison = async (page: Page, confirmNoFilters = true) => {
  await page.getByRole('button', { name: 'Run Comparison', exact: true }).click();

  if (confirmNoFilters) {
    await page.getByRole('button', { name: 'Run comparison', exact: true }).click();
  }

  await expect(page.getByText('Comparison Summary', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
};

const waitForComparisonConfigurationToPersist = async (page: Page) => {
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve, reject) => {
            const request = indexedDB.open('app-data');

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const transaction = database.transaction('comparison', 'readonly');
              const comparisonsRequest = transaction.objectStore('comparison').getAll();

              transaction.onerror = () => reject(transaction.error);
              transaction.oncomplete = () => {
                const comparisons = comparisonsRequest.result as Array<{
                  config?: {
                    sourceA?: unknown;
                    sourceB?: unknown;
                    joinColumns?: string[];
                  } | null;
                }>;

                database.close();
                resolve(
                  comparisons.some(
                    (comparison) =>
                      Boolean(comparison.config?.sourceA) &&
                      Boolean(comparison.config?.sourceB) &&
                      comparison.config?.joinColumns?.includes('id'),
                  ),
                );
              };
            };
          }),
      ),
    )
    .toBe(true);
};

const waitForComparisonResultsToPersist = async (page: Page) => {
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve, reject) => {
            const request = indexedDB.open('app-data');

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const transaction = database.transaction('comparison', 'readonly');
              const comparisonsRequest = transaction.objectStore('comparison').getAll();

              transaction.onerror = () => reject(transaction.error);
              transaction.oncomplete = () => {
                const comparisons = comparisonsRequest.result as Array<{
                  resultsTableName?: string | null;
                }>;

                database.close();
                resolve(comparisons.some((comparison) => Boolean(comparison.resultsTableName)));
              };
            };
          }),
      ),
    )
    .toBe(true);
};

test.describe('Comparison', () => {
  test.beforeEach(async ({ setupFileSystem, waitForFilesToBeProcessed }) => {
    await setupFileSystem(sourceFiles);
    await waitForFilesToBeProcessed();
  });

  test('creates a comparison from two selected CSV sources', async ({
    page,
    selectMultipleFileNodes,
  }) => {
    await createComparisonFromSelectedFiles(page, selectMultipleFileNodes);

    await expect(
      page.getByRole('button', { name: 'pondpilot.main.source_a', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'pondpilot.main.source_b', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Comparison', exact: true })).toBeEnabled();
  });

  test('detects the id join key and reports schema-only columns', async ({
    page,
    selectMultipleFileNodes,
  }) => {
    await createComparisonFromSelectedFiles(page, selectMultipleFileNodes);

    await expect(page.getByRole('checkbox', { name: 'id', exact: true })).toBeChecked();
    await expect(page.getByText('1 only in A', { exact: true })).toBeVisible();
    await expect(page.getByText('1 only in B', { exact: true })).toBeVisible();

    const onlyInSourceA = page
      .getByText('Only in Source A', { exact: true })
      .locator('..')
      .locator('..');
    const onlyInSourceB = page
      .getByText('Only in Source B', { exact: true })
      .locator('..')
      .locator('..');
    await expect(onlyInSourceA.getByText('legacy', { exact: true })).toBeVisible();
    await expect(onlyInSourceB.getByText('current', { exact: true })).toBeVisible();
  });

  test('renders added, removed, and modified rows with a full outer join', async ({
    page,
    selectMultipleFileNodes,
  }) => {
    await createComparisonFromSelectedFiles(page, selectMultipleFileNodes);

    await page.getByRole('textbox', { name: 'Comparison method' }).click();
    await page.getByRole('option', { name: 'Full outer join', exact: true }).click();
    await runComparison(page);

    await expect(page.getByText('1 ADDED', { exact: true })).toBeVisible();
    await expect(page.getByText('1 REMOVED', { exact: true })).toBeVisible();
    await expect(page.getByText('2 MODIFIED', { exact: true })).toBeVisible();

    const resultsTable = page.getByRole('table');
    await expect(resultsTable.getByRole('row').filter({ hasText: 'Bobby' })).toContainText(
      'Modified',
    );
    await expect(resultsTable.getByRole('row').filter({ hasText: 'Dan' })).toContainText('Removed');
    await expect(resultsTable.getByRole('row').filter({ hasText: 'Eve' })).toContainText('Added');
  });

  test('applies a common filter to both sources', async ({ page, selectMultipleFileNodes }) => {
    await createComparisonFromSelectedFiles(page, selectMultipleFileNodes);

    await page.getByRole('textbox', { name: 'Common Filter (WHERE clause)' }).fill('id <= 3');
    await runComparison(page, false);

    await expect(page.getByText('0 ADDED', { exact: true })).toBeVisible();
    await expect(page.getByText('0 REMOVED', { exact: true })).toBeVisible();
    await expect(page.getByText('2 MODIFIED', { exact: true })).toBeVisible();
    await expect(page.getByText('Showing 2 of 2 rows', { exact: true })).toBeVisible();
  });

  test('includes unchanged rows when difference-only mode is disabled', async ({
    page,
    selectMultipleFileNodes,
  }) => {
    await createComparisonFromSelectedFiles(page, selectMultipleFileNodes);

    await page.getByRole('checkbox', { name: 'Show only rows with differences' }).uncheck();
    await runComparison(page);

    await expect(page.getByText('1 UNCHANGED', { exact: true })).toBeVisible();
    await page.getByText('Unchanged (1)', { exact: true }).click();
    await expect(page.getByText('Showing 5 of 5 rows', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('table').getByRole('row').filter({ hasText: 'Alice' }),
    ).toContainText('Unchanged');
  });

  test('restores comparison configuration after reloading the app', async ({
    page,
    reloadPage,
    selectMultipleFileNodes,
  }) => {
    await createComparisonFromSelectedFiles(page, selectMultipleFileNodes);
    await runComparison(page);
    await waitForComparisonResultsToPersist(page);
    await waitForComparisonConfigurationToPersist(page);

    await reloadPage();

    await expect(page.getByText('Comparison Summary', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Schema Comparison', { exact: true })).toBeHidden();
  });
});
