import { mergeTests } from '@playwright/test';

import { test as dataViewTest } from '../fixtures/data-view';
import { test as baseTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';

const test = mergeTests(baseTest, scriptExplorerTest, scriptEditorTest, dataViewTest);

test.describe('Script Variable Support', () => {
  test.skip('SET VARIABLE and getvariable() should work across statements', async ({
    createScriptAndSwitchToItsTab,
    fillScript,
    runScript,
    assertDataTableMatches,
  }) => {
    await createScriptAndSwitchToItsTab();

    // Test numeric variable
    await fillScript("SET VARIABLE my_var = 30; SELECT 20 + getvariable('my_var') AS total;");
    await runScript();

    // Check that the result shows 50 (20 + 30)
    await assertDataTableMatches({
      data: [[50]],
      columnNames: ['total'],
    });
  });

  test.skip('String variables should work correctly', async ({
    createScriptAndSwitchToItsTab,
    fillScript,
    runScript,
    assertDataTableMatches,
  }) => {
    await createScriptAndSwitchToItsTab();

    // Test string variable
    await fillScript(
      "SET VARIABLE greeting = 'Hello, DuckDB!'; SELECT getvariable('greeting') AS message;",
    );
    await runScript();

    // Check that the result shows the greeting
    await assertDataTableMatches({
      data: [['Hello, DuckDB!']],
      columnNames: ['message'],
    });
  });

  test.skip('Multiple variables should work in the same session', async ({
    createScriptAndSwitchToItsTab,
    fillScript,
    runScript,
    assertDataTableMatches,
  }) => {
    await createScriptAndSwitchToItsTab();

    // Test multiple variables
    await fillScript(
      "SET VARIABLE x = 10; SET VARIABLE y = 20; SET VARIABLE z = 30; SELECT getvariable('x') + getvariable('y') + getvariable('z') AS sum;",
    );
    await runScript();

    // Check that the result shows 60 (10 + 20 + 30)
    await assertDataTableMatches({
      data: [[60]],
      columnNames: ['sum'],
    });
  });

  test.skip('Variables should persist within transaction', async ({
    createScriptAndSwitchToItsTab,
    fillScript,
    runScript,
    assertDataTableMatches,
  }) => {
    await createScriptAndSwitchToItsTab();

    // Test variables within a transaction
    await fillScript(
      "CREATE TABLE test_table (id INTEGER, value INTEGER); INSERT INTO test_table VALUES (1, 100); SET VARIABLE multiplier = 5; UPDATE test_table SET value = value * getvariable('multiplier'); SELECT * FROM test_table;",
    );
    await runScript();

    // Check that the value was multiplied by 5
    await assertDataTableMatches({
      data: [[1, 500]], // id=1, value=500 (100 * 5)
      columnNames: ['id', 'value'],
    });
  });
});
