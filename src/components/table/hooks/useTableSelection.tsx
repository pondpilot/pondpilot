import { Cell, CellContext, Table } from '@tanstack/react-table';
import { useCallback, useState } from 'react';
import { useAppNotifications } from '@components/app-notifications';
import { useDidUpdate } from '@mantine/hooks';
import { CalculateColumnSummaryProps } from '@features/data-viewer/hooks';
import { ResultColumn } from '@utils/arrow/helpers';
import { dynamicTypeViewer } from '../utils';

interface SelectedCell {
  cellId: string | null;
  value: any;
}

interface UseTableSelectionProps {
  columns: ResultColumn[];
  onRowSelectChange: () => void;
  onCellSelectChange: () => void;
  onColumnSelectChange: ({ columnName, dataType }: CalculateColumnSummaryProps) => void;
}

export const useTableSelection = ({
  columns,
  onColumnSelectChange,
  onRowSelectChange,
  onCellSelectChange,
}: UseTableSelectionProps) => {
  const { showSuccess } = useAppNotifications();
  const [lastSelectedRow, setLastSelectedRow] = useState<string>('0');
  const [lastSelectedColumn, setLastSelectedColumn] = useState<string | null>('');
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [selectedCols, setSelectedCols] = useState<Record<string, boolean>>({});
  const [selectedCell, setSelectedCell] = useState<SelectedCell>({
    cellId: null,
    value: null,
  });

  const clearSelection = useCallback(() => {
    setSelectedRows({});
    setSelectedCols({});
    setSelectedCell({ cellId: null, value: null });
    setLastSelectedColumn(null);
    setLastSelectedRow('0');
    onColumnSelectChange({ columnName: null, dataType: '' });
  }, []);

  const handleCellSelect = useCallback((cell: Cell<any, any>) => {
    const isIndexColumn = cell.column.id === '#';

    if (isIndexColumn) return;
    clearSelection();
    onCellSelectChange();

    const colMeta: any = cell.column.columnDef.meta;
    const type = colMeta?.type;
    const value = dynamicTypeViewer({
      type: type || 'other',
      value: cell.getValue(),
    });
    setSelectedCell({ cellId: cell.id, value });
  }, []);

  const handleCopySelectedRows = useCallback(
    (table: Table<any>) => {
      const selectedRowsIds = Object.keys(selectedRows).filter((id) => selectedRows[id]);
      if (!selectedRowsIds.length) return;

      const headers = table
        .getAllColumns()
        .filter((col) => col.id !== '#')
        .map((col) => col.id)
        .join('\t');

      const selectedRowsData = selectedRowsIds
        .map((rowId) => {
          const row = table.getRow(rowId);

          return table
            .getAllColumns()
            .filter((col) => col.id !== '#')
            .map((col) => {
              const value = row.getValue(col.id);

              return value ?? '';
            })
            .join('\t');
        })
        .join('\n');

      const csvContent = `${headers}\n${selectedRowsData}`;
      navigator.clipboard.writeText(csvContent);

      showSuccess({
        title: 'Selected rows copied to clipboard',
        message: '',
        autoClose: 800,
      });
    },
    [selectedRows],
  );

  const onRowSelectionChange = useCallback(
    (
      cell: CellContext<Record<string, string | number>, any>,
      e: React.MouseEvent<Element, MouseEvent>,
    ) => {
      onRowSelectChange();
      setSelectedCols({});
      setSelectedCell({ cellId: null, value: null });
      const rowId = cell.row.id;
      const isSelectRange = e.shiftKey;
      const multiple = e.ctrlKey || e.metaKey;

      if (!isSelectRange && !multiple) {
        setLastSelectedRow(rowId);
        setSelectedRows({ [rowId]: true });
        return;
      }

      if (multiple && !isSelectRange) {
        setSelectedRows((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
        setLastSelectedRow(rowId);
        return;
      }

      if (isSelectRange && !multiple) {
        if (Object.keys(selectedRows).length === 0) {
          setSelectedRows({ [rowId]: true });
          setLastSelectedRow(rowId);
          return;
        }

        const start = parseInt(lastSelectedRow, 10);
        const end = parseInt(rowId, 10);
        const selectedRowsRange = Array.from({ length: Math.abs(end - start) + 1 }, (_, i) =>
          (start < end ? start + i : start - i).toString(),
        ).reduce(
          (acc, id) => {
            acc[id] = true;
            return acc;
          },
          {} as Record<string, boolean>,
        );
        setSelectedRows(selectedRowsRange);
      }
    },
    [lastSelectedRow, JSON.stringify(selectedRows)],
  );

  const handleHeadCellClick = useCallback(
    (columnId: string, e: React.MouseEvent<Element, MouseEvent>) => {
      setSelectedCell({ cellId: null, value: null });
      setSelectedRows({});

      const isSelectRange = e.shiftKey;
      const multiple = e.ctrlKey || e.metaKey;

      if (!isSelectRange && !multiple) {
        setLastSelectedColumn(columnId);
        setSelectedCols({ [columnId]: true });
        return;
      }

      if (multiple && !isSelectRange) {
        setSelectedCols((prev) => ({ ...prev, [columnId]: !prev[columnId] }));
        setLastSelectedColumn(columnId);
        return;
      }

      if (isSelectRange && !multiple) {
        if (Object.keys(selectedCols).length === 0) {
          setSelectedCols({ [columnId]: true });
          setLastSelectedColumn(columnId);
          return;
        }

        const start = columns.findIndex((col) => col.name === lastSelectedColumn);
        const end = columns.findIndex((col) => col.name === columnId);
        const selectedCols2 = columns.slice(Math.min(start, end), Math.max(start, end) + 1).reduce(
          (acc, col) => {
            acc[col.name] = true;
            return acc;
          },
          {} as Record<string, boolean>,
        );
        setSelectedCols(selectedCols2);
      }
    },
    [lastSelectedColumn, columns, JSON.stringify(selectedCols)],
  );

  useDidUpdate(() => {
    const selectedColsKeys = Object.keys(selectedCols);
    if (selectedColsKeys.length === 1) {
      const columnName = selectedColsKeys[0];
      const dataType = columns.find((col) => col.name === columnName)?.type;
      if (dataType) {
        onColumnSelectChange({ columnName, dataType });
      }
    } else if (selectedColsKeys.length > 1) {
      onColumnSelectChange({ columnName: null, dataType: '' });
    }
  }, [selectedCols]);

  return {
    handleCellSelect,
    clearSelection,
    selectedCell,
    selectedRows,
    selectedCols,
    onRowSelectionChange,
    handleHeadCellClick,
    handleCopySelectedRows,
  };
};
