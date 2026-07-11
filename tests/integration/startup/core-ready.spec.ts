import { expect } from '@playwright/test';

import { test } from '../fixtures/page';

type AppLoadTransition = {
  state: string;
  scriptExplorerVisible: boolean;
  newScriptAvailable: boolean;
};

test('publishes interactive scripts before DuckDB-backed readiness', async ({
  page,
  reloadPage,
}) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 100,
    downloadThroughput: 1_000_000,
    uploadThroughput: 1_000_000,
  });

  await page.context().addInitScript(() => {
    const transitions: AppLoadTransition[] = [];
    Object.assign(window, { __appLoadTransitions: transitions });

    const recordState = () => {
      const appState = document.querySelector('[data-testid="app-state"]');
      const state = appState?.getAttribute('data-app-load-state');
      if (!state || transitions.at(-1)?.state === state) return;

      transitions.push({
        state,
        scriptExplorerVisible: !!document.querySelector('[data-testid="script-explorer"]'),
        newScriptAvailable: !!document.querySelector(
          '[data-testid="script-explorer-add-script-button"]',
        ),
      });
    };

    new MutationObserver(recordState).observe(document, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['data-app-load-state'],
    });
    queueMicrotask(recordState);
  });

  const readyPromise = reloadPage();
  await expect(page.getByTestId('app-state')).toHaveAttribute('data-app-load-state', 'core-ready', {
    timeout: 15_000,
  });
  await page.getByTestId('script-explorer-add-script-button').click();
  await expect(
    page.locator('[data-testid="query-editor"][data-active-editor="true"] .monaco-editor'),
  ).toBeVisible();
  await expect(page.getByTestId('run-query-button')).toBeDisabled();
  await readyPromise;
  await expect(page.getByTestId('run-query-button')).toBeEnabled();

  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await reloadPage();
  await expect(
    page.getByTestId('script-explorer').getByText('query.sql', { exact: true }),
  ).toBeVisible();

  const transitions = await page.evaluate(
    () =>
      (window as typeof window & { __appLoadTransitions: AppLoadTransition[] })
        .__appLoadTransitions,
  );
  const coreReadyIndex = transitions.findIndex(({ state }) => state === 'core-ready');
  const readyIndex = transitions.findIndex(({ state }) => state === 'ready');

  expect(coreReadyIndex).toBeGreaterThanOrEqual(0);
  expect(readyIndex).toBeGreaterThan(coreReadyIndex);
  expect(transitions[coreReadyIndex]).toMatchObject({
    scriptExplorerVisible: true,
    newScriptAvailable: true,
  });
});
