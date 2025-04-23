import { useCallback } from 'react';
import { CancelledOperation, DataAdapterApi } from '@models/data-adapter';
import { showSuccess } from '@components/app-notifications';
import { notifications } from '@mantine/notifications';
import { copyToClipboard } from '@utils/clipboard';
import { escapeCSVField } from '@utils/helpers';
import { stringifyTypedValue } from '@utils/db';

export const useTableExport = (dataAdapter: DataAdapterApi) => {
  const copyTableToClipboard = useCallback(async () => {
    const notificationId = showSuccess({
      title: 'Copying table columns to clipboard...',
      message: '',
      loading: true,
      autoClose: false,
      color: 'text-accent',
    });

    try {
      const data = await dataAdapter.getAllTableData(null);
      const columns = dataAdapter.currentSchema;

      const headers = columns.map((col) => col.name).join('\t');
      const rows = data.map((row) => columns.map((col) => row[col.name] ?? '').join('\t'));
      const tableText = [headers, ...rows].join('\n');

      await copyToClipboard(tableText);

      notifications.update({
        id: notificationId,
        title: 'Table copied to clipboard',
        message: '',
        loading: false,
        autoClose: 800,
      });
    } catch (error) {
      const autoCancelled = error instanceof CancelledOperation ? error.isSystemCancelled : false;
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
        title: 'Failed to copy table to clipboard',
        message,
        loading: false,
        autoClose: 5000,
        color: 'red',
      });
    }
  }, [dataAdapter]);

  const exportTableToCSV = useCallback(async () => {
    const notificationId = showSuccess({
      title: 'Exporting table to CSV...',
      message: '',
      loading: true,
      autoClose: false,
      color: 'text-accent',
    });

    try {
      const data = await dataAdapter.getAllTableData(null);
      const columns = dataAdapter.currentSchema;

      const csv = data
        .map((row) =>
          Object.values(row)
            .map((value, index) =>
              escapeCSVField(
                stringifyTypedValue({ value, type: columns[index]?.sqlType || 'other' }),
              ),
            )
            .join(','),
        )
        .join('\n');
      const headers = columns.map((f) => escapeCSVField(f.name)).join(',');
      const csvContent = `${headers}\n${csv}`;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'table.csv';
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      notifications.update({
        id: notificationId,
        title: 'Table exported to CSV',
        message: '',
        loading: false,
        autoClose: 800,
      });
    } catch (error) {
      const autoCancelled = error instanceof CancelledOperation ? error.isSystemCancelled : false;
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
        title: 'Failed to export table to CSV',
        message,
        loading: false,
        autoClose: 5000,
        color: 'red',
      });
    }
  }, [dataAdapter]);

  return {
    copyTableToClipboard,
    exportTableToCSV,
  };
};
