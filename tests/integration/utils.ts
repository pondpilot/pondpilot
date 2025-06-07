import { expect, Page } from '@playwright/test';

import { LOCAL_STORAGE_KEYS } from '@models/local-storage';

export const waitForAppReady = async (page: Page) => {
  // Wait for the app to be ready
  const appStatus = page.getByTestId('app-state');
  await expect(appStatus).toHaveAttribute('data-app-load-state', 'ready');
};

export const setOnboardingShown = async (page: Page, options: { setOnce?: boolean } = {}) => {
  const { setOnce = false } = options;

  await page.context().addInitScript(
    (args) => {
      const { key, setOnceLocal } = args;

      if (setOnceLocal && window.localStorage.getItem(key)) {
        return;
      }

      window.localStorage.setItem(key, 'true');
    },
    {
      key: LOCAL_STORAGE_KEYS.ONBOARDING_SHOWN,
      setOnceLocal: setOnce,
    },
  );
};

export const setVersionShown = async (
  page: Page,
  version: string,
  options: { setOnce?: boolean } = {},
) => {
  const { setOnce = false } = options;

  await page.context().addInitScript(
    (args) => {
      const { key, value, setOnceLocal } = args;

      if (setOnceLocal && window.localStorage.getItem(key)) {
        return;
      }

      window.localStorage.setItem(key, value);
    },
    {
      key: LOCAL_STORAGE_KEYS.WHATS_NEW_VERSION_SHOWN,
      value: version,
      setOnceLocal: setOnce,
    },
  );
};
