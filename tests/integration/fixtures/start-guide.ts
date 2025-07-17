import { test as base, Locator } from '@playwright/test';

type StartGuideFixtures = {
  startGuide: Locator;
  newQueryAction: Locator;
  importQueryAction: Locator;
  addFileAction: Locator;
  addFolderAction: Locator;
  addDuckDBAction: Locator;
  goToMenuAction: Locator;
  releaseNotesAction: Locator;
  onboardingAction: Locator;
};

export const test = base.extend<StartGuideFixtures>({
  startGuide: async ({ page }, use) => {
    await use(page.getByTestId('start-guide'));
  },

  newQueryAction: async ({ page }, use) => {
    await use(page.getByTestId('start-guide-action-create-new-script'));
  },

  importQueryAction: async ({ page }, use) => {
    await use(page.getByTestId('start-guide-action-import-script'));
  },

  addFileAction: async ({ page }, use) => {
    await use(page.getByTestId('start-guide-action-add-file'));
  },

  addFolderAction: async ({ page }, use) => {
    await use(page.getByTestId('start-guide-action-add-folder'));
  },

  addDuckDBAction: async ({ page }, use) => {
    await use(page.getByTestId('start-guide-action-add-remote-database'));
  },

  goToMenuAction: async ({ page }, use) => {
    await use(page.getByTestId('start-guide-action-go-to-menu'));
  },

  releaseNotesAction: async ({ page }, use) => {
    await use(page.getByTestId('start-guide-action-whats-new-modal'));
  },

  onboardingAction: async ({ page }, use) => {
    await use(page.getByTestId('start-guide-action-onboarding'));
  },
});
