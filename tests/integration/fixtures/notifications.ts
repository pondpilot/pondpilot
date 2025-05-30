import { test as base, expect, Locator } from '@playwright/test';

type NotificationFixtures = {
  /**
   * Returns the notification container locator.
   */
  notificationContainer: Locator;

  /**
   * Waits for a notification to appear with the specified title.
   * @param title - The title of the notification (e.g., 'Error', 'Success')
   * @param options - Optional configuration for waiting
   * @returns The notification locator
   */
  waitForNotification: (title?: string, options?: { timeout?: number }) => Promise<Locator>;

  /**
   * Waits for a notification and checks if it contains the expected text.
   * @param title - The title of the notification (e.g., 'Error', 'Success')
   * @param expectedText - The text or pattern to match in the notification body
   * @param options - Optional configuration for waiting
   */
  expectNotificationWithText: (
    title: string,
    expectedText: string | RegExp,
    options?: { timeout?: number },
  ) => Promise<void>;

  /**
   * Waits for an error notification with the expected message.
   * @param expectedText - The text or pattern to match in the error message
   * @param options - Optional configuration for waiting
   */
  expectErrorNotification: (
    expectedText: string | RegExp,
    options?: { timeout?: number },
  ) => Promise<void>;

  /**
   * Waits for a success notification with the expected message.
   * @param expectedText - The text or pattern to match in the success message
   * @param options - Optional configuration for waiting
   */
  expectSuccessNotification: (
    expectedText: string | RegExp,
    options?: { timeout?: number },
  ) => Promise<void>;

  /**
   * Closes all visible notifications.
   */
  closeAllNotifications: () => Promise<void>;
};

export const test = base.extend<NotificationFixtures>({
  notificationContainer: async ({ page }, use) => {
    await use(page.locator('.mantine-Notifications-root'));
  },

  waitForNotification: async ({ page }, use) => {
    await use(async (title?: string, options?: { timeout?: number }) => {
      const timeout = options?.timeout || 10000;

      // Wait for any notification to appear
      const notification = page.locator('.mantine-Notifications-notification');
      await notification.first().waitFor({ state: 'visible', timeout });

      // If title is specified, wait for notification with that title
      if (title) {
        const notificationWithTitle = notification.filter({
          has: page.getByText(title, { exact: true }),
        });
        await expect(notificationWithTitle).toBeVisible({ timeout });
        return notificationWithTitle.first();
      }

      return notification.first();
    });
  },

  expectNotificationWithText: async ({ waitForNotification }, use) => {
    await use(
      async (title: string, expectedText: string | RegExp, options?: { timeout?: number }) => {
        const notification = await waitForNotification(title, options);

        // Check that the notification contains the expected text
        await expect(notification.getByText(expectedText)).toBeVisible();
      },
    );
  },

  expectErrorNotification: async ({ expectNotificationWithText }, use) => {
    await use(async (expectedText: string | RegExp, options?: { timeout?: number }) => {
      await expectNotificationWithText('Error', expectedText, options);
    });
  },

  expectSuccessNotification: async ({ expectNotificationWithText }, use) => {
    await use(async (expectedText: string | RegExp, options?: { timeout?: number }) => {
      await expectNotificationWithText('Success', expectedText, options);
    });
  },

  closeAllNotifications: async ({ page }, use) => {
    await use(async () => {
      // Find all close buttons in notifications
      const closeButtons = page.locator(
        '.mantine-Notifications-notification button[aria-label="Close"]',
      );
      const count = await closeButtons.count();

      // Click each close button
      for (let i = 0; i < count; i += 1) {
        await closeButtons.nth(i).click();
      }

      // Wait for all notifications to be hidden
      await page.waitForFunction(() => {
        const notifications = document.querySelectorAll('.mantine-Notifications-notification');
        return notifications.length === 0;
      });
    });
  },
});
