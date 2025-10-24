import { expect, mergeTests } from '@playwright/test';

import { test as base } from '../fixtures/base';
import { test as bugReportModalTest } from '../fixtures/bug-report-modal';
import { setOnboardingShown, waitForAppReady } from '../utils';

const test = mergeTests(bugReportModalTest, base);

test.beforeEach(async ({ page }) => {
  await setOnboardingShown(page);

  // Navigate to the application
  // eslint-disable-next-line local-rules/no-playwright-page-methods
  await page.goto('/');
  await waitForAppReady(page);
});

test('Open bug report modal from collapsed navbar button', async ({
  collapsedBugReportButton,
  bugReportModal,
  bugReportCancelButton,
}) => {
  // Click the collapsed bug report button
  await collapsedBugReportButton.click();

  // Verify the modal is visible
  await expect(bugReportModal).toBeVisible();

  // Verify modal title
  await expect(bugReportModal).toContainText('Report a Bug or Request a Feature');

  // Close the modal
  await bugReportCancelButton.click();

  // Verify the modal is hidden
  await expect(bugReportModal).toBeHidden();
});

test('Open bug report modal from expanded navbar button', async ({
  page,
  expandedBugReportButton,
  bugReportModal,
  bugReportCancelButton,
}) => {
  // First, expand the navbar by clicking the collapse button (if it exists)
  const collapseSidebarButton = page.getByTestId('collapse-sidebar-button');

  // Check if navbar is already expanded (collapse button is visible)
  const isExpanded = await collapseSidebarButton.isVisible().catch(() => false);

  if (!isExpanded) {
    // Navbar is collapsed, expand it first
    const expandSidebarButton = page.getByTestId('expand-sidebar-button');
    await expandSidebarButton.click();
  }

  // Click the expanded bug report button
  await expandedBugReportButton.click();

  // Verify the modal is visible
  await expect(bugReportModal).toBeVisible();

  // Close the modal
  await bugReportCancelButton.click();

  // Verify the modal is hidden
  await expect(bugReportModal).toBeHidden();
});

test('Validate bug report form - empty description shows error', async ({
  collapsedBugReportButton,
  bugReportModal,
  bugReportSubmitButton,
}) => {
  // Open the modal
  await collapsedBugReportButton.click();
  await expect(bugReportModal).toBeVisible();

  // Try to submit without filling description
  await bugReportSubmitButton.click();

  // Verify validation error appears
  await expect(bugReportModal).toContainText('Description is required');

  // Modal should still be open
  await expect(bugReportModal).toBeVisible();
});

test('Validate bug report form - short description shows error', async ({
  collapsedBugReportButton,
  bugReportModal,
  bugReportDescriptionInput,
  bugReportSubmitButton,
}) => {
  // Open the modal
  await collapsedBugReportButton.click();
  await expect(bugReportModal).toBeVisible();

  // Fill in a very short description
  await bugReportDescriptionInput.fill('Test');

  // Try to submit
  await bugReportSubmitButton.click();

  // Verify validation error appears
  await expect(bugReportModal).toContainText(
    'Please provide a more detailed description (at least 10 characters)',
  );

  // Modal should still be open
  await expect(bugReportModal).toBeVisible();
});

test('Validate bug report form - invalid email shows error', async ({
  collapsedBugReportButton,
  bugReportModal,
  bugReportDescriptionInput,
  bugReportEmailInput,
  bugReportSubmitButton,
}) => {
  // Open the modal
  await collapsedBugReportButton.click();
  await expect(bugReportModal).toBeVisible();

  // Fill in valid description
  await bugReportDescriptionInput.fill('This is a detailed bug report description');

  // Fill in invalid email
  await bugReportEmailInput.fill('invalid-email');

  // Try to submit
  await bugReportSubmitButton.click();

  // Verify validation error appears
  await expect(bugReportModal).toContainText('Please enter a valid email address');

  // Modal should still be open
  await expect(bugReportModal).toBeVisible();
});

test('Bug report form validates email format correctly', async ({
  collapsedBugReportButton,
  bugReportModal,
  bugReportDescriptionInput,
  bugReportEmailInput,
  bugReportSubmitButton,
}) => {
  // Open the modal
  await collapsedBugReportButton.click();
  await expect(bugReportModal).toBeVisible();

  // Fill in valid description
  await bugReportDescriptionInput.fill('This is a detailed bug report description');

  // Fill in valid email
  await bugReportEmailInput.fill('test@example.com');

  // Try to submit - should not show email validation error
  await bugReportSubmitButton.click();

  // Verify no email validation error
  const emailError = bugReportModal.getByText('Please enter a valid email address');
  await expect(emailError).toBeHidden();
});

test('Include context checkbox is checked by default', async ({
  collapsedBugReportButton,
  bugReportModal,
  bugReportIncludeContextCheckbox,
}) => {
  // Open the modal
  await collapsedBugReportButton.click();
  await expect(bugReportModal).toBeVisible();

  // Verify checkbox is checked by default
  await expect(bugReportIncludeContextCheckbox).toBeChecked();
});

test('Can toggle include context checkbox', async ({
  collapsedBugReportButton,
  bugReportModal,
  bugReportIncludeContextCheckbox,
}) => {
  // Open the modal
  await collapsedBugReportButton.click();
  await expect(bugReportModal).toBeVisible();

  // Uncheck the checkbox
  await bugReportIncludeContextCheckbox.click();
  await expect(bugReportIncludeContextCheckbox).not.toBeChecked();

  // Check it again
  await bugReportIncludeContextCheckbox.click();
  await expect(bugReportIncludeContextCheckbox).toBeChecked();
});

test('Bug report buttons have proper accessibility labels', async ({
  collapsedBugReportButton,
  expandedBugReportButton,
  page,
}) => {
  // Check collapsed button has aria-label
  await expect(collapsedBugReportButton).toHaveAttribute('aria-label', 'Report a Bug');

  // Expand sidebar to access expanded button
  const expandSidebarButton = page.getByTestId('expand-sidebar-button');
  const isCollapsed = await expandSidebarButton.isVisible().catch(() => false);

  if (isCollapsed) {
    await expandSidebarButton.click();
  }

  // Check expanded button has aria-label
  await expect(expandedBugReportButton).toHaveAttribute('aria-label', 'Report a Bug');
});
