import { expect, Locator, mergeTests, Page } from '@playwright/test';

import { test as baseTest } from '../fixtures/page';
import { test as spotlightTest } from '../fixtures/spotlight';

const test = mergeTests(baseTest, spotlightTest);

const getNotebookCell = (page: Page, index: number): Locator =>
  page.getByTestId('notebook-cell').nth(index);

const waitForNotebookReady = async (page: Page) => {
  const notebook = page.getByTestId('notebook-tab-view');
  await expect(notebook).toBeVisible();
  await expect(notebook.getByTestId('notebook-cell').first()).toBeVisible();
};

const addSqlCellFromToolbar = async (page: Page) => {
  await page.getByTestId('notebook-add-cell-menu-button').click();
  await page.getByTestId('notebook-add-sql-cell-menu-item').click();
};

const fillSqlCell = async (page: Page, index: number, sql: string) => {
  const editor = getNotebookCell(page, index)
    .getByTestId('notebook-cell-sql-editor')
    .locator('.monaco-editor');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(sql);
};

const renameAlias = async (page: Page, index: number, alias: string) => {
  const cell = getNotebookCell(page, index);
  await cell.getByTestId('notebook-cell-alias-edit').click();
  const input = cell.getByTestId('notebook-cell-alias-input');
  await expect(input).toBeVisible();
  await input.fill(alias);
  await input.press('Enter');
};

const runCell = async (
  page: Page,
  index: number,
  mode: 'run' | 'upstream' | 'downstream' = 'run',
) => {
  const cell = getNotebookCell(page, index);
  if (mode === 'run') {
    await cell.getByTestId('notebook-cell-run').click();
    return;
  }

  const runMenuByTestId = cell.getByTestId('notebook-cell-run-menu');
  if (await runMenuByTestId.count()) {
    await runMenuByTestId.click();
  } else {
    await cell
      .getByTestId('notebook-cell-run')
      .locator('xpath=following-sibling::button')
      .first()
      .click();
  }
  await page.getByTestId(`notebook-cell-run-option-${mode}`).click();
};

test('reorder keeps references valid with stable refs', async ({
  page,
  createNotebookViaSpotlight,
}) => {
  await createNotebookViaSpotlight();
  await waitForNotebookReady(page);

  await addSqlCellFromToolbar(page);
  await renameAlias(page, 0, 'source_alias');
  await fillSqlCell(page, 0, 'SELECT 1 AS v');
  await fillSqlCell(page, 1, 'SELECT v + 1 AS v FROM source_alias');

  await runCell(page, 0);
  await expect(getNotebookCell(page, 0).getByTestId('data-table')).toBeVisible();
  await runCell(page, 1);
  await expect(getNotebookCell(page, 1).getByTestId('data-table')).toBeVisible();

  await getNotebookCell(page, 0).getByTestId('notebook-cell-move-down').click();
  await expect(page.getByText('Invalid references after reorder')).toHaveCount(0);

  await page.getByTestId('notebook-run-all-button').click();
  await expect(page.getByTestId('notebook-run-all-button')).toBeDisabled();
  await expect(page.getByTestId('notebook-run-all-button')).toBeEnabled({ timeout: 30000 });

  await expect(getNotebookCell(page, 0).getByTestId('data-table')).toBeVisible();
  await expect(
    getNotebookCell(page, 0).getByTestId('data-table').getByText('2', { exact: true }),
  ).toBeVisible();
});

test('run all executes SQL cells in dependency order', async ({
  page,
  createNotebookViaSpotlight,
}) => {
  await createNotebookViaSpotlight();
  await waitForNotebookReady(page);

  await addSqlCellFromToolbar(page);
  await addSqlCellFromToolbar(page);

  await renameAlias(page, 0, 'final_alias');
  await renameAlias(page, 1, 'source_alias');
  await renameAlias(page, 2, 'mid_alias');

  await fillSqlCell(page, 0, 'SELECT x + 1 AS x FROM mid_alias');
  await fillSqlCell(page, 1, 'SELECT 1 AS x');
  await fillSqlCell(page, 2, 'SELECT x + 1 AS x FROM source_alias');

  await page.getByTestId('notebook-run-all-button').click();
  await expect(page.getByTestId('notebook-run-all-button')).toBeDisabled();
  await expect(page.getByTestId('notebook-run-all-button')).toBeEnabled({ timeout: 30000 });

  await expect(getNotebookCell(page, 0).getByTestId('data-table')).toBeVisible();
  await expect(
    getNotebookCell(page, 0).getByTestId('data-table').getByText('3', { exact: true }),
  ).toBeVisible();
});

test('run auto-materializes missing upstream while run upstream executes dependency chain', async ({
  page,
  createNotebookViaSpotlight,
}) => {
  await createNotebookViaSpotlight();
  await waitForNotebookReady(page);

  await addSqlCellFromToolbar(page);
  await renameAlias(page, 0, 'source_alias');

  await fillSqlCell(page, 0, 'SELECT 1 AS x');
  await fillSqlCell(page, 1, 'SELECT x + 1 AS x FROM source_alias');

  await runCell(page, 1, 'run');

  await expect(getNotebookCell(page, 0).getByTestId('data-table')).toBeVisible();
  await expect(getNotebookCell(page, 1).getByTestId('data-table')).toBeVisible();
  await expect(
    getNotebookCell(page, 1).getByTestId('data-table').getByText('2', { exact: true }),
  ).toBeVisible();

  await runCell(page, 1, 'upstream');
  await expect(getNotebookCell(page, 0).getByTestId('data-table')).toBeVisible();
  await expect(getNotebookCell(page, 1).getByTestId('data-table')).toBeVisible();
  await expect(
    getNotebookCell(page, 1).getByTestId('data-table').getByText('2', { exact: true }),
  ).toBeVisible();
});

test('run downstream executes dependent cells in order', async ({
  page,
  createNotebookViaSpotlight,
}) => {
  await createNotebookViaSpotlight();
  await waitForNotebookReady(page);

  await addSqlCellFromToolbar(page);
  await renameAlias(page, 0, 'source_alias');
  await renameAlias(page, 1, 'mid_alias');
  await fillSqlCell(page, 0, 'SELECT 1 AS x');
  await fillSqlCell(page, 1, 'SELECT x + 1 AS x FROM source_alias');

  await addSqlCellFromToolbar(page);
  await renameAlias(page, 2, 'final_alias');
  await fillSqlCell(page, 2, 'SELECT x + 1 AS x FROM mid_alias');

  await runCell(page, 0, 'downstream');

  await expect(getNotebookCell(page, 0).getByTestId('data-table')).toBeVisible();
  await expect(getNotebookCell(page, 1).getByTestId('data-table')).toBeVisible();
  await expect(getNotebookCell(page, 2).getByTestId('data-table')).toBeVisible();
  await expect(
    getNotebookCell(page, 2).getByTestId('data-table').getByText('3', { exact: true }),
  ).toBeVisible();
});

test('duplicate alias is blocked at rename time', async ({ page, createNotebookViaSpotlight }) => {
  await createNotebookViaSpotlight();
  await waitForNotebookReady(page);

  await addSqlCellFromToolbar(page);
  await renameAlias(page, 0, 'dup_alias');
  await renameAlias(page, 1, 'dup_alias');

  await expect(page.getByText('already used by another SQL cell')).toBeVisible();
});

test('cycle is surfaced as an execution error', async ({ page, createNotebookViaSpotlight }) => {
  await createNotebookViaSpotlight();
  await waitForNotebookReady(page);

  await addSqlCellFromToolbar(page);
  await renameAlias(page, 0, 'a_ref');
  await renameAlias(page, 1, 'b_ref');
  await fillSqlCell(page, 0, 'SELECT * FROM b_ref');
  await fillSqlCell(page, 1, 'SELECT * FROM a_ref');

  await runCell(page, 0);
  await expect(
    getNotebookCell(page, 0).getByText('Circular dependency detected for this cell'),
  ).toBeVisible();
});
