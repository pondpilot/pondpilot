import { showSuccess } from '@components/app-notifications';
import { NotificationData } from '@mantine/notifications';

interface CopyToClipboardOptions {
  /**
   * Show a success notification after copying
   * @default false
   */
  showNotification?: boolean;

  /**
   * Title for the success notification
   * @default "Copied"
   */
  notificationTitle?: string;

  /**
   * Message for the success notification
   * @default ""
   */
  notificationMessage?: string;

  /**
   * Auto close duration in milliseconds
   * @default 800
   */
  autoClose?: number;

  /**
   * Custom notification options to override defaults
   */
  notificationOptions?: Partial<NotificationData>;
}

/**
 * Copies text to clipboard with optional success notification
 * @param text - The text to copy to clipboard
 * @param options - Configuration options for the copy operation
 * @returns Promise resolving to true if copy was successful, false otherwise
 */
export async function copyToClipboard(
  text: string,
  options: CopyToClipboardOptions = {},
): Promise<boolean> {
  const {
    showNotification = false,
    notificationTitle = 'Copied',
    notificationMessage = '',
    autoClose = 800,
    notificationOptions = {},
  } = options;

  try {
    await navigator.clipboard.writeText(text);

    if (showNotification) {
      showSuccess({
        title: notificationTitle,
        message: notificationMessage,
        autoClose,
        ...notificationOptions,
      });
    }

    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}
