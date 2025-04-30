import { showError, showSuccess, showWarning } from '@components/app-notifications';
import { notifications } from '@mantine/notifications';
import { CancelledOperation, DataAdapterApi } from '@models/data-adapter';
import { DBColumn } from '@models/db';
import { copyToClipboard } from '@utils/clipboard';
import { formatTableData, getStringifyTypedRows } from '@utils/table';

interface CopyTableColumnsProps {
  columns: DBColumn[];
  dataAdapter: DataAdapterApi;
}

/**
 * Handle copy selected columns
 */
export const copyTableColumns = async ({ columns, dataAdapter }: CopyTableColumnsProps) => {
  // We do not want to call API if no columns are selected
  if (!columns.length) {
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
    const data = await dataAdapter.getAllTableData(columns);

    const formattedRows = getStringifyTypedRows(data, columns);
    const tsvRowsData = formatTableData(formattedRows, '\t');
    const header = formatTableData([columns.map((c) => c.name)], '\t');
    const tsvContent = `${header}\n${tsvRowsData}`;
    await copyToClipboard(tsvContent);

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

interface ExportTableColumnsToCSVProps {
  dataAdapter: DataAdapterApi;
  fileName: string;
  columns: DBColumn[];
}

export const exportTableColumnsToCSV = async ({
  dataAdapter,
  fileName,
  columns,
}: ExportTableColumnsToCSVProps) => {
  const notificationId = showSuccess({
    title: 'Exporting selected columns to CSV...',
    message: '',
    loading: true,
    autoClose: false,
    color: 'text-accent',
  });

  try {
    const data = await dataAdapter.getAllTableData(columns);

    const formattedRows = getStringifyTypedRows(data, columns);
    const csvRows = formatTableData(formattedRows, ',');
    const csvHeader = formatTableData([columns.map((c) => c.name)], ',');
    const csvContent = `${csvHeader}\n${csvRows}`;

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
};
