import { test as base, expect, Locator } from '@playwright/test';

type OnboardingModalFixtures = {
  /**
   * Returns the onboarding modal locator.
   */
  onboardingModal: Locator;

  /**
   * Returns the submit button in the onboarding modal.
   */
  submitButton: Locator;

  /**
   * Returns the button to show the onboarding modal.
   */
  showOnboardingButton: Locator;

  /**
   * Opens the onboarding modal by clicking the show button.
   */
  openOnboardingModal: () => Promise<void>;

  /**
   * Closes the onboarding modal by clicking the submit button.
   */
  closeOnboardingModal: () => Promise<void>;
};

export const test = base.extend<OnboardingModalFixtures>({
  onboardingModal: async ({ page }, use) => {
    await use(page.getByTestId('onboarding-modal'));
  },

  submitButton: async ({ page }, use) => {
    await use(page.getByTestId('onboarding-modal-submit-button'));
  },

  showOnboardingButton: async ({ page }, use) => {
    await use(page.getByTestId('start-guide-action-onboarding'));
  },

  openOnboardingModal: async ({ showOnboardingButton }, use) => {
    await use(async () => {
      await expect(showOnboardingButton).toBeVisible();
      await showOnboardingButton.click();
    });
  },

  closeOnboardingModal: async ({ submitButton, onboardingModal }, use) => {
    await use(async () => {
      await expect(submitButton).toBeVisible();
      await submitButton.click();
      await expect(onboardingModal).toBeHidden();
    });
  },
});
