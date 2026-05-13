/* eslint-disable playwright/no-skipped-test -- Quack browser E2E is gated until DuckDB-WASM ships compatible Quack support. */
import { getNodeDataTestIdPrefix } from '@components/explorer-tree/utils/node-test-id';
import { expect, mergeTests } from '@playwright/test';

import {
  ensureDuckDBBinary,
  getFreePort,
  QUACK_E2E_TOKEN,
  QuackServerProcess,
  startQuackServer,
  stopQuackServer,
  waitForQuackServer,
} from './quack-test-utils';
import { test as fileSystemExplorerTest } from '../fixtures/file-system-explorer';
import { test as notificationsTest } from '../fixtures/notifications';
import { test as pageTest } from '../fixtures/page';
import { test as scriptEditorTest } from '../fixtures/script-editor';
import { test as scriptExplorerTest } from '../fixtures/script-explorer';
import { test as spotlightTest } from '../fixtures/spotlight';

const test = mergeTests(
  pageTest,
  spotlightTest,
  notificationsTest,
  fileSystemExplorerTest,
  scriptExplorerTest,
  scriptEditorTest,
);

test.describe('Quack datasource', () => {
  test.setTimeout(90_000);

  test.skip(
    process.env.RUN_QUACK_E2E !== 'true',
    'Set RUN_QUACK_E2E=true to run the Quack browser E2E against a local DuckDB server',
  );

  let server: QuackServerProcess | undefined;
  let port: number;

  test.beforeEach(async () => {
    ensureDuckDBBinary();
    port = await getFreePort();
    server = startQuackServer(port);
    await waitForQuackServer(port, server);
  });

  test.afterEach(async () => {
    if (!server) return;
    stopQuackServer(server);
    server = undefined;
  });

  test('connects to a local DuckDB Quack server and queries data', async ({
    page,
    openDatasourceWizard,
    waitForNotification,
    createScriptAndSwitchToItsTab,
    fillScript,
    runScript,
  }) => {
    const browserDiagnostics: string[] = [];
    page.on('console', (message) => {
      if (!['warning', 'error'].includes(message.type())) return;
      const text = message.text();
      if (!/quack|duckdb|extension|wasm/i.test(text)) return;
      browserDiagnostics.push(`[${message.type()}] ${text}`);
    });

    await openDatasourceWizard();
    await page.getByRole('button', { name: /Remote Server/ }).click();
    await page
      .getByTestId('remote-server-kind-selector')
      .getByText('Quack', { exact: true })
      .click();

    await page.getByTestId('quack-uri-input').fill(`quack:localhost:${port}`);
    await page.getByTestId('quack-database-name-input').fill('quack_remote');
    await page.getByTestId('quack-token-input').fill(QUACK_E2E_TOKEN);
    await page.getByLabel('Disable SSL (local/dev only)').check();

    await page.getByTestId('add-quack-button').click();
    const notification = await waitForNotification(undefined, { timeout: 60000 });
    const notificationText = await notification.innerText();
    if (!notificationText.includes('Quack server added')) {
      throw new Error(
        `Expected notification to contain "Quack server added". Received:\n${notificationText}\n\n` +
          `Browser diagnostics:\n${browserDiagnostics.join('\n') || '<none>'}`,
      );
    }

    await expect(page.getByText('quack_remote ✓')).toBeVisible();

    const remoteNodes = page.getByTestId(
      new RegExp(`^${getNodeDataTestIdPrefix('data-explorer-remote', '.*')}-container$`),
    );
    const quackNode = remoteNodes.filter({
      has: page.locator('p').getByText('quack_remote ✓', { exact: true }),
    });
    const quackNodeId = await quackNode.getAttribute('data-value');
    if (!quackNodeId) throw new Error('Quack explorer node has no data-value');

    await quackNode.click();
    await page.locator(`div[data-value="${quackNodeId}.main"]`).click();
    const quackItemsNode = page.locator(`div[data-value="${quackNodeId}.main.quack_items"]`);
    await expect(quackItemsNode).toBeVisible();

    await createScriptAndSwitchToItsTab();
    await fillScript('SELECT name FROM quack_remote.main.quack_items WHERE id = 2;');
    await runScript();

    await expect(page.getByText('beta')).toBeVisible();
  });
});
