import { NotificationData, notifications } from '@mantine/notifications';
import {
  IconAlertCircleFilled,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconInfoCircleFilled,
} from '@tabler/icons-react';
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
    info: <IconInfoCircleFilled size={16} className="text-iconAccent-light" />,
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
