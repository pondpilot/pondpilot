import { test as base, Locator } from '@playwright/test';

type BugReportModalFixtures = {
  bugReportModal: Locator;
  bugReportCategorySelect: Locator;
  bugReportDescriptionInput: Locator;
  bugReportEmailInput: Locator;
  bugReportIncludeContextCheckbox: Locator;
  bugReportCancelButton: Locator;
  bugReportSubmitButton: Locator;
  collapsedBugReportButton: Locator;
  expandedBugReportButton: Locator;
};

export const test = base.extend<BugReportModalFixtures>({
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

  bugReportCancelButton: async ({ page }, use) => {
    await use(page.getByTestId('bug-report-cancel-button'));
  },

  bugReportSubmitButton: async ({ page }, use) => {
    await use(page.getByTestId('bug-report-submit-button'));
  },

  collapsedBugReportButton: async ({ page }, use) => {
    await use(page.getByTestId('collapsed-bug-report-button'));
  },

  expandedBugReportButton: async ({ page }, use) => {
    await use(page.getByTestId('expanded-bug-report-button'));
  },
});
