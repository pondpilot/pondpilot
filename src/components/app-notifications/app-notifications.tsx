import { NotificationData, notifications } from '@mantine/notifications';
import {
  IconAlertCircleFilled,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconInfoCircleFilled,
} from '@tabler/icons-react';
import { ReactNode } from 'react';

import { cn } from '@utils/ui/styles';

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
export const showError = (data: NotificationData) => showAppAlert(data, 'error');

interface ErrorWithActionData extends NotificationData {
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const showErrorWithAction = (data: ErrorWithActionData) => {
  const { action, ...notificationData } = data;

  // Generate an ID for the notification if not provided
  const notificationId = notificationData.id || `error-${Date.now()}`;

  // Create custom message with action button if provided
  const messageContent = action ? (
    <div className="flex flex-col gap-2">
      {data.message && <div>{data.message}</div>}
      <div className="flex justify-end">
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
    'error',
  );
};
