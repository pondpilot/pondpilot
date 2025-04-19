import { useCallback } from 'react';
import { DataAdapterApi } from '@models/data-adapter';
import { showSuccess } from '@components/app-notifications';

export const useTableExport = (dataAdapterApi: DataAdapterApi) => {
  const copyTableToClipboard = useCallback(async () => {
    const result = await dataAdapterApi.getAllTableData?.();
    const columns = await dataAdapterApi.getSchema();
    if (!result || !columns) return;

    const data = result?.toArray().map((row) => row.toJSON());
    const headers = columns.map((col) => col.name).join('\t');
    const rows = data.map((row) => columns.map((col) => row[col.name] ?? '').join('\t'));
    const tableText = [headers, ...rows].join('\n');
    navigator.clipboard.writeText(tableText);
    showSuccess({
      title: 'Table copied to clipboard',
      message: '',
      autoClose: 800,
    });
  }, []);

  const exportTableToCSV = useCallback(async () => {
    const result = await dataAdapterApi.getAllTableData?.();
    const columns = await dataAdapterApi.getSchema();

    if (!result || !columns) return;

    const csv = result
      .toArray()
      .map((row) => Object.values(row).join(','))
      .join('\n');
    const headers = columns.map((f) => f.name).join(',');
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
  }, [dataAdapterApi]);

  return {
    copyTableToClipboard,
    exportTableToCSV,
  };
};
