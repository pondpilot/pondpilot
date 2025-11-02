import { test as base, Locator } from '@playwright/test';

type BugReportModalFixtures = {
  bugReportModal: Locator;
  bugReportButton: Locator;
  bugReportCategorySelect: Locator;
  bugReportDescriptionInput: Locator;
  bugReportEmailInput: Locator;
  bugReportIncludeContextCheckbox: Locator;
  bugReportSubmitButton: Locator;
  bugReportCancelButton: Locator;
  openBugReportModal: () => Promise<void>;
};

export const test = base.extend<BugReportModalFixtures>({
  bugReportButton: async ({ page }, use) => {
    await use(page.getByTestId('expanded-bug-report-button'));
  },

  bugReportModal: async ({ page }, use) => {
    await use(page.getByTestId('bug-report-modal'));
  },

  bugReportCategorySelect: async ({ page }, use) => {
    await use(page.getByTestId('bug-report-category-select'));
  },

  bugReportDescriptionInput: async ({ page }, use) => {
    await use(page.getByTestId('bug-report-description-input'));
  },

  bugReportEmailInput: async ({ page }, use) => {
    await use(page.getByTestId('bug-report-email-input'));
  },

  bugReportIncludeContextCheckbox: async ({ page }, use) => {
    await use(page.getByTestId('bug-report-include-context-checkbox'));
  },

  bugReportSubmitButton: async ({ page }, use) => {
    await use(page.getByTestId('bug-report-submit-button'));
  },

  bugReportCancelButton: async ({ page }, use) => {
    await use(page.getByTestId('bug-report-cancel-button'));
  },

  openBugReportModal: async ({ bugReportButton }, use) => {
    await use(async () => {
      await bugReportButton.click();
    });
  },
});
