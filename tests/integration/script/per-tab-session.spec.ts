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
  // `memory` is a non-default catalog (the default session is pondpilot·main),
  // so switching to it and re-reading after reload proves the session was
  // restored and replayed. `main` is the only schema that can be USEd in a
  // fresh catalog — information_schema/pg_catalog are system schemas DuckDB
  // rejects in USE.
  await createScriptAndSwitchToItsTab();
  await fillScript('USE memory; SELECT current_database() AS db, current_schema() AS schema;');
  await runScript();
  await assertDataTableMatches({
    data: [['memory', 'main']],
    columnNames: ['db', 'schema'],
  });

  await reloadPage();
  await expect(page.getByTestId('script-session-selector-trigger')).toHaveAttribute(
    'aria-label',
    'Script session: memory · main',
  );

  await fillScript('SELECT current_database() AS db, current_schema() AS schema;');
  await runScript();
  await assertDataTableMatches({
    data: [['memory', 'main']],
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
  await page.getByTestId('script-session-selector-trigger').click();
  await page.getByTestId('script-session-catalog-memory').click();
  await fillScript('SELECT current_database() AS db;');
  await runScript();
  await assertDataTableMatches({ data: [['memory']], columnNames: ['db'] });
});

test('script result reads preserve extended search_path state', async ({
  createScriptAndSwitchToItsTab,
  fillScript,
  runScript,
  assertDataTableMatches,
}) => {
  await createScriptAndSwitchToItsTab();
  await fillScript(`
    USE memory;
    CREATE SCHEMA IF NOT EXISTS s1;
    CREATE SCHEMA IF NOT EXISTS s2;
    CREATE OR REPLACE TABLE s2.search_path_probe AS SELECT 7 AS value;
    SET search_path = 's1,s2';
    SELECT * FROM search_path_probe;
  `);
  await runScript();

  await assertDataTableMatches({ data: [[7]], columnNames: ['value'] });
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
  await page.getByTestId('script-session-selector-trigger').click();
  await expect(page.getByText('Transient', { exact: true })).toBeVisible();
});
