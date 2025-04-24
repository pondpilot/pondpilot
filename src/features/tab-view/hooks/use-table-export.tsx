import { useCallback } from 'react';
import { CancelledOperation, DataAdapterApi } from '@models/data-adapter';
import { showError, showSuccess, showWarning } from '@components/app-notifications';
import { notifications } from '@mantine/notifications';
import { copyToClipboard } from '@utils/clipboard';
import { escapeCSVField } from '@utils/helpers';
import { stringifyTypedValue } from '@utils/db';
import { TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { getTabName } from '@utils/navigation';

export const useTableExport = (dataAdapter: DataAdapterApi, tabId: TabId) => {
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
      const rows = data.map((row) =>
        columns
          .map((col) => {
            const value = stringifyTypedValue({
              value: row[col.name],
              type: col.sqlType || 'other',
            });
            return value ?? '';
          })
          .join('\t'),
      );
      const tableText = [headers, ...rows].join('\n');

      await copyToClipboard(tableText);

      notifications.update({
        id: notificationId,
        title: 'Table copied to clipboard',
        message: '',
        loading: false,
        autoClose: 1500,
      });
    } catch (error) {
      notifications.hide(notificationId);
      const autoCancelled = error instanceof CancelledOperation ? error.isSystemCancelled : false;
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (autoCancelled) {
        showWarning({ title: 'Cancelled', message });
        return;
      }

      showError({
        title: 'Failed to copy table to clipboard',
        message,
        autoClose: 5000,
      });
    }
  }, [dataAdapter]);

  const exportTableToCSV = useCallback(async () => {
    const state = useAppStore.getState();
    const tab = state.tabs.get(tabId);

    const tabName = tab
      ? getTabName(tab, state.sqlScripts, state.dataSources, state.localEntries)
      : 'unknown-tab-export';

    const notificationId = showSuccess({
      title: 'Exporting table to CSV...',
      message: '',
      loading: true,
      autoClose: false,
      color: 'text-accent',
    });

    try {
      const fileName = `${tabName}.csv`;
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
      link.download = fileName;
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      notifications.update({
        id: notificationId,
        title: `${fileName} exported to CSV`,
        message: '',
        loading: false,
        autoClose: 1500,
      });
    } catch (error) {
      notifications.hide(notificationId);
      const autoCancelled = error instanceof CancelledOperation ? error.isSystemCancelled : false;
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (autoCancelled) {
        showWarning({ title: 'Cancelled', message });
        return;
      }

      showError({
        title: 'Failed to export table to CSV',
        message,
        autoClose: 5000,
      });
    }
  }, [dataAdapter, tabId]);

  return {
    copyTableToClipboard,
    exportTableToCSV,
  };
};
