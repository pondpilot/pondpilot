import { useCallback } from 'react';
import { useAppNotifications } from '@components/app-notifications';
import { useAppContext } from '@features/app-context';
import { Table as ApacheTable } from 'apache-arrow';
import { useAppStore } from '@store/app-store';

export const useTableExport = () => {
  const { executeQuery } = useAppContext();
  const { showSuccess } = useAppNotifications();
  const tabs = useAppStore.use.tabs();
  const activeTabId = useAppStore.use.activeTabId();
  const activeTab = tabs.values().find((tab) => tab.id === activeTabId);

  const handleCopyToClipboard = useCallback((convertedTable: { columns: any[]; data: any[] }) => {
    const { columns, data } = convertedTable;
    if (Array.isArray(data) && Array.isArray(columns)) {
      const headers = columns.map((col) => col.name).join('\t');
      const rows = data.map((row) => columns.map((col) => row[col.name] ?? '').join('\t'));
      const tableText = [headers, ...rows].join('\n');
      navigator.clipboard.writeText(tableText);
      showSuccess({
        title: 'Table copied to clipboard',
        message: '',
        autoClose: 800,
      });
    }
  }, []);

  const exportTableToCSV = useCallback(async () => {
    if (!activeTab?.query.originalQuery) return;
    const queryResult: ApacheTable = await executeQuery(activeTab?.query.originalQuery);
    if (!queryResult) return;
    const csv = queryResult
      .toArray()
      .map((row) => Object.values(row).join(','))
      .join('\n');
    const headers = queryResult.schema.fields.map((f) => f.name).join(',');
    const csvContent = `${headers}\n${csv}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeTab?.name.split('.')[0]}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }, [activeTab?.name, executeQuery, activeTab?.query.originalQuery]);

  return {
    handleCopyToClipboard,
    exportTableToCSV,
  };
};
