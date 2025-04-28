import { showSuccess } from '@components/app-notifications';
import { notifications } from '@mantine/notifications';
import { DataAdapterApi } from '@models/data-adapter';
import { DBColumn } from '@models/db';
import { copyToClipboard } from '@utils/clipboard';
import { stringifyTypedValue } from '@utils/db';

/**
 * Handle copy selected columns
 */
export const copySelectedColumns = async (
  selectedCols: DBColumn[],
  dataAdapter: DataAdapterApi,
) => {
  // We do not want to call API if no columns are selected
  if (!selectedCols.length) {
    return;
  }

  const notificationId = showSuccess({
    title: 'Copying selected columns to clipboard...',
    message: '',
    loading: true,
    autoClose: false,
    color: 'text-accent',
  });
  try {
    const data = await dataAdapter.getAllTableData(selectedCols);

    const headers = selectedCols.map((col) => col.name).join('\t');
    const rows = data.map((row) =>
      selectedCols
        .map((col) => {
          const value = stringifyTypedValue({ value: row[col.name], type: col.sqlType });
          return value ?? '';
        })
        .join('\t'),
    );
    const tableText = [headers, ...rows].join('\n');
    await copyToClipboard(tableText);

    notifications.update({
      id: notificationId,
      title: 'Selected columns copied to clipboard',
      message: '',
      loading: false,
      autoClose: 800,
    });
  } catch (error) {
    const autoCancelled = error instanceof DOMException ? error.name === 'Cancelled' : false;
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (autoCancelled) {
      notifications.update({
        id: notificationId,
        title: 'Cancelled',
        message,
        loading: false,
        autoClose: 800,
        color: 'text-warning',
      });
      return;
    }

    notifications.update({
      id: notificationId,
      title: 'Failed to copy selected columns to clipboard',
      message,
      loading: false,
      autoClose: 5000,
      color: 'red',
    });
  }
};
