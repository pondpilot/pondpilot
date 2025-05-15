import { expect, mergeTests } from '@playwright/test';

import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as spotlightTest } from '../fixtures/spotlight';
import { test as tabTest } from '../fixtures/tab';

const test = mergeTests(baseTest, spotlightTest, tabTest, scriptEditorTest, scriptExplorerTest);

test('Close all tabs via spotlight', async ({
  page,
  createScriptAndSwitchToItsTab,
  closeAllTabsViaSpotlight,
}) => {
  await createScriptAndSwitchToItsTab();
  await createScriptAndSwitchToItsTab();
  await createScriptAndSwitchToItsTab();

  const tabsList = page.getByTestId('tabs-list');
  await expect(tabsList.getByTestId('close-tab-button')).toHaveCount(3);

  await closeAllTabsViaSpotlight();

  await expect(tabsList.getByTestId('close-tab-button')).toHaveCount(0);
});

test('Close all tabs via spotlight - with keyboard trigger', async ({
  page,
  createScriptAndSwitchToItsTab,
  closeAllTabsViaSpotlight,
}) => {
  await createScriptAndSwitchToItsTab();
  await createScriptAndSwitchToItsTab();

  const tabsList = page.getByTestId('tabs-list');
  await expect(tabsList.getByTestId('close-tab-button')).toHaveCount(2);

  await closeAllTabsViaSpotlight({ trigger: 'keyboard' });

  await expect(tabsList.getByTestId('close-tab-button')).toHaveCount(0);
});

test('Close all but active tab via spotlight', async ({
  page,
  createScriptAndSwitchToItsTab,
  switchToTab,
  closeAllButActiveTabViaSpotlight,
}) => {
  await createScriptAndSwitchToItsTab(); // query
  await createScriptAndSwitchToItsTab(); // query_1
  await createScriptAndSwitchToItsTab(); // query_2

  await switchToTab('query');

  const tabsList = page.getByTestId('tabs-list');
  await expect(tabsList.getByTestId('close-tab-button')).toHaveCount(3);

  await closeAllButActiveTabViaSpotlight();

  await expect(tabsList.getByTestId('close-tab-button')).toHaveCount(1);

  await expect(page.locator('[data-tab-handle-active="true"]')).toContainText('query');
});

test('Close all but active tab via spotlight - middle tab selected', async ({
  page,
  createScriptAndSwitchToItsTab,
  switchToTab,
  closeAllButActiveTabViaSpotlight,
}) => {
  await createScriptAndSwitchToItsTab(); // query
  await createScriptAndSwitchToItsTab(); // query_1
  await createScriptAndSwitchToItsTab(); // query_2

  await switchToTab('query_1');

  const tabsList = page.getByTestId('tabs-list');
  await expect(tabsList.getByTestId('close-tab-button')).toHaveCount(3);

  await closeAllButActiveTabViaSpotlight();

  await expect(tabsList.getByTestId('close-tab-button')).toHaveCount(1);

  await expect(page.locator('[data-tab-handle-active="true"]')).toContainText('query_1');
});
