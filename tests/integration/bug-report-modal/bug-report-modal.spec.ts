import { expect, mergeTests } from '@playwright/test';

import { test as bugReportTest } from '../fixtures/bug-report-modal';
import { test as baseTest } from '../fixtures/page';

const test = mergeTests(baseTest, bugReportTest);

test.describe('Bug Report Modal', () => {
  test('should open bug report modal when clicking bug report button', async ({
    bugReportModal,
    openBugReportModal,
  }) => {
    // Verify modal is not visible initially
    await expect(bugReportModal).toBeHidden();

    // Open bug report modal
    await openBugReportModal();

    // Verify modal is visible
    await expect(bugReportModal).toBeVisible();
  });

  test('should display all form fields', async ({
    openBugReportModal,
    bugReportCategorySelect,
    bugReportDescriptionInput,
    bugReportEmailInput,
    bugReportIncludeContextCheckbox,
    bugReportSubmitButton,
    bugReportCancelButton,
  }) => {
    // Open modal
    await openBugReportModal();

    // Verify all form fields are visible
    await expect(bugReportCategorySelect).toBeVisible();
    await expect(bugReportDescriptionInput).toBeVisible();
    await expect(bugReportEmailInput).toBeVisible();
    await expect(bugReportIncludeContextCheckbox).toBeVisible();
    await expect(bugReportSubmitButton).toBeVisible();
    await expect(bugReportCancelButton).toBeVisible();
  });

  test('should have default values', async ({
    openBugReportModal,
    bugReportDescriptionInput,
    bugReportEmailInput,
    bugReportIncludeContextCheckbox,
  }) => {
    await openBugReportModal();

    // Verify default values
    await expect(bugReportDescriptionInput).toHaveValue('');
    await expect(bugReportEmailInput).toHaveValue('');
    await expect(bugReportIncludeContextCheckbox).toBeChecked();
  });

  test('should show validation error for empty description', async ({
    openBugReportModal,
    bugReportSubmitButton,
    page,
  }) => {
    await openBugReportModal();

    // Try to submit without description
    await bugReportSubmitButton.click();

    // Verify error message is shown
    await expect(page.getByText('Description is required')).toBeVisible();
  });

  test('should show validation error for short description', async ({
    openBugReportModal,
    bugReportDescriptionInput,
    bugReportSubmitButton,
    page,
  }) => {
    await openBugReportModal();

    // Fill in short description (less than 10 characters)
    await bugReportDescriptionInput.fill('short');
    await bugReportSubmitButton.click();

    // Verify error message is shown
    await expect(
      page.getByText('Please provide a more detailed description (at least 10 characters)'),
    ).toBeVisible();
  });

  test('should show validation error for invalid email', async ({
    openBugReportModal,
    bugReportDescriptionInput,
    bugReportEmailInput,
    bugReportSubmitButton,
    page,
  }) => {
    await openBugReportModal();

    // Fill in valid description and invalid email
    await bugReportDescriptionInput.fill('This is a test bug report with enough characters');
    await bugReportEmailInput.fill('invalid-email');
    await bugReportSubmitButton.click();

    // Verify error message is shown
    await expect(page.getByText('Please enter a valid email address')).toBeVisible();
  });

  test('should select different categories', async ({
    openBugReportModal,
    bugReportCategorySelect,
    page,
  }) => {
    await openBugReportModal();

    // Click on category select
    await bugReportCategorySelect.click();

    // Verify category options are visible
    await expect(page.getByText('🐛 UI Bug')).toBeVisible();
    await expect(page.getByText('💥 Crash / Error')).toBeVisible();
    await expect(page.getByText('⚡ Performance')).toBeVisible();
    await expect(page.getByText('💡 Feature Request')).toBeVisible();
    await expect(page.getByText('📊 Data Issue')).toBeVisible();
    await expect(page.getByText('❓ Other')).toBeVisible();
  });
});
