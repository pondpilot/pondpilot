import { expect, mergeTests } from '@playwright/test';

import { test as dataViewTest } from '../fixtures/data-view';
import { test as dbExplorerTest } from '../fixtures/db-explorer';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as baseTest } from '../fixtures/page';
import { test as spotlightTest } from '../fixtures/spotlight';
import { test as waitUtilsTest } from '../fixtures/wait-utils';
import { FileSystemNode } from '../models';

const test = mergeTests(
  baseTest,
  filePickerTest,
  fileSystemExplorerTest,
  dbExplorerTest,
  dataViewTest,
  spotlightTest,
  waitUtilsTest,
);

const restoredSources: FileSystemNode[] = [
  {
    type: 'file',
    ext: 'csv',
    name: 'startup_alpha',
    content: 'id,label\n1,alpha\n2,beta',
  },
  {
    type: 'file',
    ext: 'csv',
    name: 'startup_beta',
    content: 'id,value\n1,10\n2,20',
  },
  {
    type: 'file',
    ext: 'csv',
    name: 'startup_gamma',
    content: 'id,enabled\n1,true\n2,false',
  },
  {
    type: 'file',
    ext: 'duckdb',
    name: 'startup_database',
    content:
      "CREATE TABLE startup_table (id INTEGER, description VARCHAR); INSERT INTO startup_table VALUES (1, 'restored');",
  },
];

test('hydrates restored local metadata after ready without blocking source use', async ({
  page,
  setupFileSystem,
  waitForFilesToBeProcessed,
  reloadPage,
  assertFileExplorerItems,
  assertDBExplorerItems,
  openFileFromExplorer,
  assertDataTableMatches,
  getDBNodeByName,
  openSpotlight,
}) => {
  await setupFileSystem(restoredSources);
  await waitForFilesToBeProcessed();

  await reloadPage();

  await expect(page.getByTestId('app-state')).toHaveAttribute('data-app-load-state', 'ready');
  await assertFileExplorerItems(['startup_alpha', 'startup_beta', 'startup_gamma']);
  await assertDBExplorerItems(['startup_database']);

  // Views are queryable as soon as restore reports ready, independent of the
  // background metadata refresh.
  await openFileFromExplorer('startup_alpha');
  await assertDataTableMatches({
    data: [
      ['1', 'alpha'],
      ['2', 'beta'],
    ],
    columnNames: ['id', 'label'],
  });

  // The attached database gains its schema, table, and columns when the
  // background metadata snapshot merges into the store.
  await (await getDBNodeByName('startup_database')).click();
  await (await getDBNodeByName('main')).click();
  const tableNode = await getDBNodeByName('startup_table');
  await expect(tableNode).toBeVisible();
  await tableNode.click();
  await assertDataTableMatches({
    data: [['1', 'restored']],
    columnNames: ['id', 'description'],
  });

  // Spotlight receives the same merged table metadata.
  const spotlight = await openSpotlight();
  await page.getByTestId('spotlight-search').fill('startup_table');
  await expect(spotlight.getByText('startup_table', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  // Comparison source selection reads metadata-backed attached tables and
  // remains able to select flat-file sources.
  const comparisonSpotlight = await openSpotlight();
  await comparisonSpotlight.getByTestId('spotlight-action-create-new-comparison').click();

  const sourceButtons = page.getByRole('button', { name: 'Not selected', exact: true });
  await sourceButtons.nth(0).click();
  await page.getByTestId('spotlight-search').fill('startup_table');
  await page.getByTestId('spotlight-menu').getByText('startup_table', { exact: true }).click();

  await sourceButtons.nth(0).click();
  await page.getByTestId('spotlight-search').fill('startup_alpha');
  await page.getByTestId('spotlight-menu').getByText('startup_alpha', { exact: true }).click();

  await expect(
    page
      .getByRole('button', {
        name: 'startup_database.main.startup_table',
        exact: true,
      })
      .last(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'pondpilot.main.startup_alpha', exact: true }),
  ).toBeVisible();
});
