import { showError, showSuccess, showWarning } from '@components/app-notifications';
import { notifications } from '@mantine/notifications';
import { CancelledOperation, DataAdapterApi } from '@models/data-adapter';
import {
  BaseExportOptions,
  DelimitedTextExportOptions,
  ExportFormat,
} from '@models/export-options';
import { TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { copyToClipboard } from '@utils/clipboard';
import { createExportFileName, exportData } from '@utils/export-data';
import { getTabNameFromStore } from '@utils/tab-utils';
import { useCallback, useState } from 'react';

export type ExportError = {
  type: 'cancelled' | 'export_error';
  message: string;
  originalError?: unknown;
};

export interface ExportResult {
  success: boolean;
  error?: ExportError;
}

export const useTableExport = (dataAdapter: DataAdapterApi, tabId: TabId) => {
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const tabName = useAppStore((state) =>
    getTabNameFromStore(tabId, state.tabs, state.sqlScripts, state.dataSources, state.localEntries),
  );

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
      const rows = data.map((row) => columns.map((col) => row[col.id] ?? '').join('\t'));
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
    const notificationId = showSuccess({
      title: 'Exporting table to CSV...',
      message: '',
      loading: true,
      autoClose: false,
      color: 'text-accent',
    });

    try {
      const fileName = `${tabName}.csv`;

      const csvOptions: DelimitedTextExportOptions = {
        includeHeader: true,
        delimiter: ',',
        quoteChar: '"',
        escapeChar: '"',
      };

      await exportData(dataAdapter, 'csv', csvOptions, fileName);

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
  }, [dataAdapter, tabName]);

  const openExportOptions = useCallback(() => {
    setExportModalOpen(true);
  }, []);

  const closeExportOptions = useCallback(() => {
    setExportModalOpen(false);
  }, []);

  const handleExport = useCallback(
    async (
      format: ExportFormat,
      options: BaseExportOptions,
      customFileName?: string,
    ): Promise<ExportResult> => {
      // Use custom filename if provided, otherwise generate one
      const fileName = customFileName || createExportFileName(tabName, format);

      const formatName = format.toUpperCase();
      const notificationId = showSuccess({
        title: `Exporting table to ${formatName}...`,
        message: '',
        loading: true,
        autoClose: false,
        color: 'text-accent',
      });

      try {
        await exportData(dataAdapter, format, options, fileName);

        notifications.update({
          id: notificationId,
          title: `${fileName} exported successfully`,
          message: '',
          loading: false,
          autoClose: 1500,
        });

        return { success: true };
      } catch (error) {
        notifications.hide(notificationId);
        const autoCancelled = error instanceof CancelledOperation ? error.isSystemCancelled : false;
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (autoCancelled) {
          showWarning({ title: 'Cancelled', message });
          return {
            success: false,
            error: {
              type: 'cancelled',
              message,
            },
          };
        }

        showError({
          title: `Failed to export table to ${formatName}`,
          message,
          autoClose: 5000,
        });

        return {
          success: false,
          error: {
            type: 'export_error',
            message,
            originalError: error,
          },
        };
      }
    },
    [dataAdapter, tabName],
  );

  return {
    copyTableToClipboard,
    exportTableToCSV,
    openExportOptions,
    closeExportOptions,
    handleExport,
    exportModalOpen,
    tabName,
  };
};
