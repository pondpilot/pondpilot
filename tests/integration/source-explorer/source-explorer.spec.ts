import { mergeTests, expect } from '@playwright/test';
import { test as baseTest } from '../fixtures/page';
import { test as explorerTest } from '../fixtures/explorer';
import { test as tabTest } from '../fixtures/tab';
import { test as spotlightTest } from '../fixtures/spotlight';
import { test as queryEditorTest } from '../fixtures/query-editor';
import { test as dataViewTest } from '../fixtures/data-view';

const test = mergeTests(
  baseTest,
  explorerTest,
  tabTest,
  queryEditorTest,
  spotlightTest,
  dataViewTest,
);

test('Select items in the query explorer list using Hotkeys', async ({
  page,
  createQueryAndSwitchToItsTab,
  getQueryItemsFromExplorer,
  selectQueryItemByIndex,
  selectMultipleQueryItems,
  deselectAllQueryItems,
  isQueryItemSelected,
}) => {
  // Create 3 query tabs
  for (let i = 0; i < 3; i += 1) {
    await createQueryAndSwitchToItsTab();
  }

  // Get the query items from the explorer
  const queryItems = await getQueryItemsFromExplorer();
  const count = await queryItems.count();

  // Select all items using ControlOrMeta + A
  await selectQueryItemByIndex(0);
  await page.keyboard.press('ControlOrMeta+A');

  for (let i = 0; i < count; i += 1) {
    expect(await isQueryItemSelected(i)).toBe(true);
  }

  // Deselect all items using Escape and check that all items are deselected
  await deselectAllQueryItems();

  for (let i = 0; i < count; i += 1) {
    expect(await isQueryItemSelected(i)).toBe(false);
  }

  // Select specific items (first and third)
  await selectMultipleQueryItems([0, 2]);

  // Expect that the selected queries are the first and third
  expect(await isQueryItemSelected(0)).toBe(true);
  expect(await isQueryItemSelected(1)).toBe(false);
  expect(await isQueryItemSelected(2)).toBe(true);

  // Click outside the explorer to deselect all items
  await page.click('body');
  for (let i = 0; i < count; i += 1) {
    expect(await isQueryItemSelected(i)).toBe(false);
  }
});
