import { NotificationData, notifications } from '@mantine/notifications';
import {
  IconAlertCircleFilled,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconCopy,
  IconInfoCircleFilled,
} from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { ReactNode } from 'react';

const ERROR_MESSAGE_MAX_LENGTH = 200;

const classNames = {
  root: 'w-[424px] right-[-20px] bg-backgroundInverse-light dark:bg-backgroundInverse-dark rounded-2xl',
  icon: 'bg-transparent self-start size-[16px] mr-2 ',
  title: 'text-textContrast-light dark:text-textContrast-dark ',
  description: 'text-textTertiary-light dark:text-textTertiary-dark',
  body: 'text-textTertiary-light dark:text-textTertiary-dark',
  closeButton:
    'bg-transparent self-start hover:bg-transparent text-textContrast-light dark:text-textContrast-dark',
};

const showAppAlert = (data: NotificationData, type: 'info' | 'success' | 'warning' | 'error') => {
  const iconMap = {
    info: (
      <IconInfoCircleFilled
        size={16}
        className="text-brand-blue-400 dark:text-brand-blue-neon-700"
      />
    ),
    success: <IconCircleCheckFilled size={16} className="text-iconSuccess" />,
    warning: <IconAlertCircleFilled size={16} className="text-iconWarning" />,
    error: <IconCircleXFilled size={16} className="text-iconError" />,
  };

  return notifications.show({
    ...data,
    icon: iconMap[type],
    classNames: {
      ...classNames,
      title: data.message ? classNames.title : cn(classNames.title, 'mb-0'),
      icon: data.message ? classNames.icon : cn(classNames.icon, 'mt-1.5'),
    },
  });
};

export const showAlert = (data: NotificationData) => showAppAlert(data, 'info');
export const showSuccess = (data: NotificationData) => showAppAlert(data, 'success');
export const showWarning = (data: NotificationData) => showAppAlert(data, 'warning');

/**
 * Show an error notification with a "Copy Error" button and automatic
 * truncation for long messages.
 */
export const showError = (data: NotificationData) => {
  const rawMessage = typeof data.message === 'string' ? data.message : null;

  if (!rawMessage) {
    return showAppAlert(data, 'error');
  }

  const isLong = rawMessage.length > ERROR_MESSAGE_MAX_LENGTH;
  const displayMessage = isLong ? `${rawMessage.slice(0, ERROR_MESSAGE_MAX_LENGTH)}…` : rawMessage;

  const messageContent = (
    <div className="flex flex-col gap-2">
      <div className="break-words">{displayMessage}</div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(rawMessage)}
          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-backgroundAccent-light dark:bg-backgroundAccent-dark text-textContrast-light dark:text-textContrast-dark rounded hover:opacity-90 transition-opacity"
        >
          <IconCopy size={12} />
          Copy Error
        </button>
      </div>
    </div>
  );

  return showAppAlert({ ...data, message: messageContent as ReactNode }, 'error');
};

interface NotificationWithActionData extends NotificationData {
  action?: {
    label: string;
    onClick: () => void;
  };
}

const showAppAlertWithAction = (
  data: NotificationWithActionData,
  type: 'info' | 'success' | 'warning' | 'error',
) => {
  const { action, ...notificationData } = data;

  // Generate an ID for the notification if not provided
  const notificationId = notificationData.id || `${type}-${Date.now()}`;

  const rawMessage = typeof data.message === 'string' ? data.message : null;
  const isError = type === 'error' && rawMessage;
  const isLongError = isError && rawMessage.length > ERROR_MESSAGE_MAX_LENGTH;
  const displayMessage = isLongError
    ? `${rawMessage.slice(0, ERROR_MESSAGE_MAX_LENGTH)}…`
    : data.message;

  // Create custom message with action button(s) if provided
  const messageContent =
    action || isError ? (
      <div className="flex flex-col gap-2">
        {displayMessage && <div className="break-words">{displayMessage}</div>}
        <div className="flex justify-end gap-2">
          {isError && (
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(rawMessage)}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-backgroundAccent-light dark:bg-backgroundAccent-dark text-textContrast-light dark:text-textContrast-dark rounded hover:opacity-90 transition-opacity"
            >
              <IconCopy size={12} />
              Copy Error
            </button>
          )}
          {action && (
            <button
              type="button"
              onClick={() => {
                notifications.hide(notificationId);
                action.onClick();
              }}
              className="px-3 py-1 text-xs font-medium bg-backgroundAccent-light dark:bg-backgroundAccent-dark text-textContrast-light dark:text-textContrast-dark rounded hover:opacity-90 transition-opacity"
            >
              {action.label}
            </button>
          )}
        </div>
      </div>
    ) : (
      data.message
    );

  return showAppAlert(
    {
      ...notificationData,
      id: notificationId,
      message: messageContent as ReactNode,
    },
    type,
  );
};

export const showAlertWithAction = (data: NotificationWithActionData) =>
  showAppAlertWithAction(data, 'info');

export const showErrorWithAction = (data: NotificationWithActionData) =>
  showAppAlertWithAction(data, 'error');

export const showWarningWithAction = (data: NotificationWithActionData) =>
  showAppAlertWithAction(data, 'warning');
