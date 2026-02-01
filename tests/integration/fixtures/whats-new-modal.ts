import { test as base, Locator } from '@playwright/test';

type WhatsNewModalFixtures = {
  whatsNewModal: Locator;
  whatsNewModalContent: Locator;
  whatsNewModalSubmitButton: Locator;
  whatsNewVersionList: Locator;
  newVersionAlert: Locator;
  newVersionAlertOpenButton: Locator;
  newVersionAlertCancelButton: Locator;
  newVersionAlertCloseButton: Locator;
};

export const test = base.extend<WhatsNewModalFixtures>({
  whatsNewModal: async ({ page }, use) => {
    await use(page.getByTestId('whats-new-modal'));
  },

  whatsNewModalContent: async ({ page }, use) => {
    await use(page.getByTestId('whats-new-modal-content'));
  },

  whatsNewModalSubmitButton: async ({ page }, use) => {
    await use(page.getByTestId('whats-new-modal-submit-button'));
  },

  whatsNewVersionList: async ({ page }, use) => {
    await use(page.getByTestId('whats-new-version-list'));
  },

  newVersionAlert: async ({ page }, use) => {
    await use(page.getByTestId('new-version-alert'));
  },

  newVersionAlertOpenButton: async ({ page }, use) => {
    await use(page.getByTestId('new-version-alert-open-button'));
  },

  newVersionAlertCancelButton: async ({ page }, use) => {
    await use(page.getByTestId('new-version-alert-cancel-button'));
  },

  newVersionAlertCloseButton: async ({ page }, use) => {
    await use(page.getByTestId('new-version-alert-close-button'));
  },
});
