import { showError, showSuccess, showWarning } from '@components/app-notifications';
import { notifications } from '@mantine/notifications';
import { CancelledOperation, DataAdapterApi } from '@models/data-adapter';
import { DBColumn } from '@models/db';
import { copyToClipboard } from '@utils/clipboard';
import { isSameSchema } from '@utils/db';
import { formatTableData, getStringifyTypedRows } from '@utils/table';

function prepCopyTargetText({
  columns,
  tableSchema,
}: {
  columns: DBColumn[];
  tableSchema: DBColumn[];
}) {
  return isSameSchema(columns, tableSchema) ? 'table' : 'selected columns';
}

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

  const copyTargetText = prepCopyTargetText({ columns, tableSchema: dataAdapter.currentSchema });

  const notificationId = showSuccess({
    title: `Copying ${copyTargetText} to clipboard...`,
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
      title: `${copyTargetText.charAt(0).toUpperCase()}${copyTargetText.slice(1)} copied to clipboard`,
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
      title: `Failed to copy ${copyTargetText} to clipboard`,
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
  // Create a copy target text
  const copyTargetText = prepCopyTargetText({ columns, tableSchema: dataAdapter.currentSchema });

  const notificationId = showSuccess({
    title: `Exporting ${copyTargetText} to CSV...`,
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
      title: `Failed to export ${copyTargetText} to CSV`,
      message,
      autoClose: 5000,
    });
  }
};
