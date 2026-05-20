import { expect, mergeTests } from '@playwright/test';

import { test as dataViewTest } from '../fixtures/data-view';
import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as tabTest } from '../fixtures/tab';

const test = mergeTests(baseTest, scriptExplorerTest, scriptEditorTest, tabTest, dataViewTest);

test('script tabs keep temp tables isolated on pinned sessions', async ({
  page,
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  switchToTab,
  assertDataTableMatches,
  activeScriptEditor,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript('USE memory; CREATE TEMP TABLE t AS SELECT 42 AS answer; SELECT * FROM t;');
  await runScript();

  await createScriptAndSwitchToItsTab();
  await fillScript('SELECT * FROM t;');
  await activeScriptEditor.getByTestId('run-query-button').click();
  await expect(page.getByText('Error running query')).toBeVisible({ timeout: 30000 });

  await switchToTab('query');
  await fillScript('SELECT * FROM t;');
  await runScript();
  await assertDataTableMatches({ data: [[42]], columnNames: ['answer'] });
});

test('script session catalog and schema survive reload and are replayed on run', async ({
  page,
  reloadPage,
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  assertDataTableMatches,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(
    'USE pondpilot.information_schema; SELECT current_database() AS db, current_schema() AS schema;',
  );
  await runScript();
  await assertDataTableMatches({
    data: [['pondpilot', 'information_schema']],
    columnNames: ['db', 'schema'],
  });

  await reloadPage();
  await expect(page.getByLabel('Session catalog')).toHaveValue('pondpilot');
  await expect(page.getByLabel('Session schema')).toHaveValue('information_schema');

  await fillScript('SELECT current_database() AS db, current_schema() AS schema;');
  await runScript();
  await assertDataTableMatches({
    data: [['pondpilot', 'information_schema']],
    columnNames: ['db', 'schema'],
  });
});

test('catalog dropdown selection is applied on next run', async ({
  page,
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  assertDataTableMatches,
}) => {
  await createScriptAndSwitchToItsTab();
  await page.getByLabel('Session catalog').click();
  await page.getByRole('option', { name: 'memory' }).click();
  await fillScript('SELECT current_database() AS db;');
  await runScript();
  await assertDataTableMatches({ data: [['memory']], columnNames: ['db'] });
});

test('restored script tab can run while previous result reader is still open', async ({
  reloadPage,
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  assertDataTableMatches,
}, testInfo) => {
  testInfo.setTimeout(60000);

  await createScriptAndSwitchToItsTab();
  await fillScript('SELECT range AS value FROM range(100000);');
  await runScript();

  await reloadPage();
  await fillScript('SELECT 123 AS value;');
  await runScript();

  await assertDataTableMatches({ data: [[123]], columnNames: ['value'] });
});

test('evicted script sessions show a transient badge', async ({
  page,
  createScriptAndSwitchToItsTab,
  fillScript,
  switchToTab,
}, testInfo) => {
  testInfo.setTimeout(120000);

  const runActiveScript = async () => {
    const activeEditor = page.locator('[data-testid="query-editor"][data-active-editor="true"]');
    await activeEditor.getByTestId('run-query-button').click();
    await page.waitForSelector('text=Processing Query...', { state: 'hidden', timeout: 30000 });
    await expect(activeEditor.getByText('Query ran successfully')).toBeVisible({ timeout: 30000 });
  };

  await createScriptAndSwitchToItsTab();
  await fillScript('USE memory; CREATE TEMP TABLE evicted_t AS SELECT 42 AS answer; SELECT 1;');
  await runActiveScript();

  for (let index = 0; index < 25; index += 1) {
    await createScriptAndSwitchToItsTab();
    await fillScript(`SELECT ${index};`);
    await runActiveScript();
  }

  await expect(page.getByText('Script session evicted')).toBeVisible({ timeout: 30000 });

  await switchToTab('query');
  await expect(page.getByText('Transient session')).toBeVisible();
});
