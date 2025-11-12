import { useDidUpdate } from '@mantine/hooks';
import { DataRow, DBColumn, DBTableOrViewSchema, FormattedValue } from '@models/db';
import { Cell, CellContext, Table } from '@tanstack/react-table';
import { copyToClipboard } from '@utils/clipboard';
import { stringifyTypedValue } from '@utils/db';
import { formatTableData } from '@utils/table';
import { useCallback, useState } from 'react';

import { ColumnMeta } from '../model';

interface SelectedCell {
  cellId: string | null;
  rawValue: any;
  formattedValue: FormattedValue | null;
}

interface UseTableSelectionProps {
  schema: DBTableOrViewSchema;
  onRowSelectChange: () => void;
  onCellSelectChange: () => void;
  onColumnSelectChange: (column: DBColumn | null) => void;
}

export const useTableSelection = ({
  schema,
  onColumnSelectChange,
  onRowSelectChange,
  onCellSelectChange,
}: UseTableSelectionProps) => {
  const [lastSelectedRow, setLastSelectedRow] = useState<string>('0');
  const [lastSelectedColumn, setLastSelectedColumn] = useState<string | null>('');
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [selectedCols, setSelectedCols] = useState<Record<string, boolean>>({});
  const [selectedCell, setSelectedCell] = useState<SelectedCell>({
    cellId: null,
    rawValue: null,
    formattedValue: null,
  });

  const clearSelection = useCallback(() => {
    setSelectedRows({});
    setSelectedCols({});
    setSelectedCell({ cellId: null, rawValue: null, formattedValue: null });
    setLastSelectedColumn(null);
    setLastSelectedRow('0');
    onColumnSelectChange(null);
  }, [onColumnSelectChange]);

  const handleCellSelect = useCallback(
    (cell: Cell<any, any>) => {
      const isIndexColumn = cell.column.getIsFirstColumn();

      if (isIndexColumn) return;
      clearSelection();
      onCellSelectChange();

      const { type } = cell.column.columnDef.meta as ColumnMeta;
      const value = cell.getValue();
      const formattedValue = stringifyTypedValue({
        type,
        value,
      });
      setSelectedCell({ cellId: cell.id, rawValue: value, formattedValue });
    },
    [clearSelection, onCellSelectChange],
  );

  const handleCopySelectedRows = useCallback(
    (table: Table<any>) => {
      const selectedRowsIds = Object.keys(selectedRows).filter((id) => selectedRows[id]);
      if (!selectedRowsIds.length) return;

      const tableData = selectedRowsIds.map((rowId) => {
        const row = table.getRow(rowId);
        const [_, ...cells] = row.getAllCells();
        const rowData = cells.map((cell) => {
          const { type } = cell.column.columnDef.meta as ColumnMeta;
          const rawValue = cell.getValue();
          const { type: fValueType, formattedValue } = stringifyTypedValue({
            type,
            value: rawValue,
          });

          return fValueType === 'null' ? '' : formattedValue;
        });

        return rowData;
      });

      const formattedData = formatTableData(tableData, '\t');

      copyToClipboard(formattedData, {
        showNotification: true,
        notificationTitle: 'Selected rows copied to clipboard',
      });
    },
    [selectedRows],
  );

  const onRowSelectionChange = useCallback(
    (cell: CellContext<DataRow, any>, e: React.MouseEvent<Element, MouseEvent>) => {
      onRowSelectChange();
      setSelectedCols({});
      setSelectedCell({ cellId: null, rawValue: null, formattedValue: null });
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
        setSelectedRows((prev) => {
          if (Object.keys(prev).length === 0) {
            setLastSelectedRow(rowId);
            return { [rowId]: true };
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
          return selectedRowsRange;
        });
      }
    },
    [lastSelectedRow, onRowSelectChange],
  );

  const handleHeadCellClick = useCallback(
    (columnId: string, e: React.MouseEvent<Element, MouseEvent>) => {
      setSelectedCell({ cellId: null, rawValue: null, formattedValue: null });
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
        setSelectedCols((prev) => {
          if (Object.keys(prev).length === 0) {
            setLastSelectedColumn(columnId);
            return { [columnId]: true };
          }

          const start = schema.findIndex((col) => col.id === lastSelectedColumn);
          const end = schema.findIndex((col) => col.id === columnId);
          const selectedCols2 = schema.slice(Math.min(start, end), Math.max(start, end) + 1).reduce(
            (acc, col) => {
              acc[col.id] = true;
              return acc;
            },
            {} as Record<string, boolean>,
          );
          return selectedCols2;
        });
      }
    },
    [lastSelectedColumn, schema],
  );

  useDidUpdate(() => {
    const selectedColsKeys = Object.keys(selectedCols);
    if (selectedColsKeys.length === 1) {
      const columnName = selectedColsKeys[0];
      const column = schema.find((col) => col.id === columnName);
      if (column) {
        onColumnSelectChange(column);
      }
    } else if (selectedColsKeys.length > 1) {
      onColumnSelectChange(null);
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
