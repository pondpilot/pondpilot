import { LOCAL_STORAGE_KEYS } from '@models/local-storage';
import { expect, Page } from '@playwright/test';

export const waitForAppReady = async (page: Page) => {
  // Wait for the app to be ready
  const appStatus = page.getByTestId('app-state');
  await expect(appStatus).toHaveAttribute('data-app-load-state', 'ready');
};

export const setOnboardingShown = async (page: Page) => {
  await page.context().addInitScript((key) => {
    window.localStorage.setItem(key, 'true');
  }, LOCAL_STORAGE_KEYS.ONBOARDING_SHOWN);
};

export const setVersionShown = async (page: Page, version: string) => {
  await page.context().addInitScript(
    (props) => {
      window.localStorage.setItem(props.key, props.value);
    },
    { key: LOCAL_STORAGE_KEYS.WHATS_NEW_VERSION_SHOWN, value: version },
  );
};
