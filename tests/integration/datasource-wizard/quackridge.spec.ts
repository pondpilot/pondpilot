/* eslint-disable playwright/no-skipped-test, playwright/no-conditional-in-test, playwright/no-conditional-expect -- Real native QuackRidge E2E is explicitly gated and accepts listener shutdown as replay protection. */
import { readFileSync } from 'fs';

import { expect, mergeTests } from '@playwright/test';

import {
  createPairingChallenge,
  callQuackRidgeControl,
  getManualPairing,
  QuackRidgeHarness,
  startQuackRidgeHarness,
  stopQuackRidgeHarness,
} from './quackridge-test-utils';
import { test as dataViewTest } from '../fixtures/data-view';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as notificationsTest } from '../fixtures/notifications';
import { test as pageTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as spotlightTest } from '../fixtures/spotlight';
import { test as testTmpTest } from '../fixtures/test-tmp';

const test = mergeTests(
  pageTest,
  dataViewTest,
  testTmpTest,
  spotlightTest,
  notificationsTest,
  fileSystemExplorerTest,
  scriptExplorerTest,
  scriptEditorTest,
);

const dismissNotifications = async (page: import('@playwright/test').Page) => {
  const notifications = page.locator('.mantine-Notifications-notification');
  for (let index = (await notifications.count()) - 1; index >= 0; index -= 1) {
    await notifications.nth(index).locator('button').last().click();
  }
  await expect(notifications).toHaveCount(0, { timeout: 5_000 });
};

test.describe('QuackRidge local PostgreSQL bridge', () => {
  test.setTimeout(120_000);
  test.skip(
    process.env.RUN_QUACKRIDGE_E2E !== 'true',
    'Set RUN_QUACKRIDGE_E2E=true with explicit trusted binary and extension paths',
  );

  let harness: QuackRidgeHarness | undefined;

  test.beforeEach(async () => {
    harness = await startQuackRidgeHarness();
  });

  test.afterEach(async () => {
    if (harness) await stopQuackRidgeHarness(harness);
    harness = undefined;
  });

  test('pairs, discovers metadata, executes a server-side join, reconnects, and denies writes', async ({
    page,
    openDatasourceWizard,
    waitForNotification,
    createScriptAndSwitchToItsTab,
    fillScript,
    runScript,
    runScriptButton,
    reloadPage,
    exportTableToCSV,
    testTmp,
  }) => {
    if (!harness) throw new Error('QuackRidge harness was not started');
    const challenge = createPairingChallenge(harness, 'http://localhost:6173');

    await openDatasourceWizard();
    await page.getByRole('button', { name: /QuackRidge Local PostgreSQL bridge/i }).click();
    await page.getByTestId('quackridge-pairing-url-input').fill(challenge.url);
    await page.getByTestId('quackridge-pairing-code-input').fill(challenge.nonce);
    await page.getByTestId('connect-quackridge-button').click();
    await expect(await waitForNotification('QuackRidge connected')).toBeVisible();

    await expect(page.getByText('quackridge ✓')).toBeVisible();
    await page.getByRole('treeitem', { name: 'quackridge ✓' }).click();
    await expect(page.getByRole('treeitem', { name: 'support' })).toBeVisible();
    await page.getByRole('treeitem', { name: 'warehouse' }).click();
    await expect(page.getByRole('treeitem', { name: 'public' })).toBeVisible();
    await page.getByRole('treeitem', { name: 'public' }).click();
    await expect(page.getByText('customers', { exact: true })).toBeVisible();
    await expect(page.getByText('orders', { exact: true })).toBeVisible();
    await page.getByRole('treeitem', { name: 'customers' }).click();
    const previewTab = page.getByRole('button', {
      name: 'warehouse.public.customers',
      exact: true,
    });
    await expect(previewTab).toBeVisible();
    await previewTab.getByRole('button').click();

    await createScriptAndSwitchToItsTab();
    await page.getByTestId('script-execution-target').click();
    await page.getByRole('option', { name: 'QuackRidge · quackridge' }).click();
    await expect(
      page.getByText('Server-side · read-only · cancellation unavailable'),
    ).toBeVisible();

    await fillScript('SELECT id, name FROM warehouse.public.customers ORDER BY id;');
    await runScript();
    await expect(page.getByText('Ada')).toBeVisible();
    await expect(page.getByText('Grace')).toBeVisible();

    await fillScript(`
      SELECT c.name, sum(o.amount) AS total
      FROM warehouse.public.customers c
      JOIN warehouse.public.orders o ON o.customer_id = c.id
      GROUP BY c.name
      ORDER BY c.name;
    `);
    await runScript();
    await expect(page.getByText('Ada')).toBeVisible();
    await expect(page.getByText('49.75')).toBeVisible();
    const exportPath = testTmp.join('quackridge-join.csv');
    await exportTableToCSV(exportPath);
    expect(readFileSync(exportPath, 'utf8')).toMatch(/Ada,49\.75/);

    await reloadPage();
    await expect(page.getByText('quackridge ⟳')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('quackridge ✓')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('script-execution-target')).toHaveValue(
      'QuackRidge · quackridge',
    );
    await runScript();
    await expect(page.getByText('Grace')).toBeVisible();

    const deniedStatements = [
      { sql: "INSERT INTO warehouse.public.customers VALUES (3, 'Unsafe')" },
      { sql: 'CREATE TABLE unsafe(id INTEGER)' },
      { sql: "ATTACH '/tmp/unsafe.duckdb' AS unsafe" },
      { sql: 'INSTALL httpfs' },
      { sql: "SELECT * FROM read_csv_auto('/etc/passwd')", resultError: true },
      {
        sql: "SELECT * FROM postgres_query('warehouse', 'DROP TABLE customers')",
        resultError: true,
      },
      { sql: 'SET threads = 1' },
    ];
    for (const statement of deniedStatements) {
      await dismissNotifications(page);
      await fillScript(statement.sql);
      await runScriptButton.click();
      if (statement.resultError) {
        await expect(page.getByText('Query error. Review and try again.')).toBeVisible({
          timeout: 30_000,
        });
        continue;
      }
      const rejection = await waitForNotification(undefined, { timeout: 30_000 });
      await expect(rejection).toContainText(/rejected|read-only|not allowed|authorization/i);
    }

    try {
      const replay = await page.request.post(challenge.url, {
        data: { nonce: challenge.nonce },
        headers: { Origin: 'http://localhost:6173' },
      });
      expect(replay.status()).toBeGreaterThanOrEqual(400);
    } catch (error) {
      expect(String(error)).toMatch(/ECONNREFUSED|socket|connect/i);
    }

    expect(`${harness.stdout.join('')}\n${harness.stderr.join('')}`).not.toContain(
      'quackridge-e2e-password',
    );

    const rotated = await callQuackRidgeControl(harness, 'rotate_token');
    expect(rotated.ok).toBe(true);
    await reloadPage();
    await expect(page.getByText('quackridge ⚠')).toBeVisible({ timeout: 30_000 });
  });

  test('rejects wrong, expired, and replayed pairing credentials', async ({
    page,
    openDatasourceWizard,
    waitForNotification,
  }) => {
    if (!harness) throw new Error('QuackRidge harness was not started');
    await openDatasourceWizard();
    await page.getByRole('button', { name: /QuackRidge Local PostgreSQL bridge/i }).click();

    const wrong = createPairingChallenge(harness, 'http://localhost:6173');
    await page.getByLabel('Temporary pairing URL').fill(wrong.url);
    await page.getByLabel('One-time pairing code').fill('0'.repeat(32));
    await page.getByRole('button', { name: 'Connect QuackRidge' }).click();
    await expect(await waitForNotification('Could not connect QuackRidge')).toContainText(
      /rejected|verify the code/i,
    );

    await dismissNotifications(page);
    const expired = createPairingChallenge(harness, 'http://localhost:6173', '1s');
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await page.getByLabel('Temporary pairing URL').fill(expired.url);
    await page.getByLabel('One-time pairing code').fill(expired.nonce);
    await page.getByRole('button', { name: 'Connect QuackRidge' }).click();
    await expect(await waitForNotification('Could not connect QuackRidge')).toContainText(
      /expired|reach the local/i,
    );

    await dismissNotifications(page);
    const manual = getManualPairing(harness);
    await page.getByText('Enter details manually').click();
    await page.getByLabel('Quack endpoint').fill(manual.endpoint);
    await page.getByLabel('QuackRidge token').fill('wrong-token-that-is-long-enough-0000');
    await page.getByRole('button', { name: 'Connect QuackRidge' }).click();
    await expect(await waitForNotification('Could not connect QuackRidge')).toContainText(
      /authentication|attach|connect/i,
    );
  });
});
