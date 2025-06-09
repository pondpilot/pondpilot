import { Table, ScrollArea, Text, Box, ActionIcon, Tooltip, Menu } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { QueryResults } from '@models/ai-chat';
import { IconCopy, IconDownload, IconSortAscending, IconSortDescending } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { useState, useMemo } from 'react';

interface ChatResultTableProps {
  results: QueryResults;
}

type SortConfig = {
  column: number;
  direction: 'asc' | 'desc';
} | null;

export const ChatResultTable = ({ results }: ChatResultTableProps) => {
  const clipboard = useClipboard();
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);

  // Sort the data if needed
  const sortedRows = useMemo(() => {
    if (!sortConfig) return results.rows;

    return [...results.rows].sort((a, b) => {
      const aVal = a[sortConfig.column];
      const bVal = b[sortConfig.column];

      // Handle nulls
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return sortConfig.direction === 'asc' ? -1 : 1;
      if (bVal === null) return sortConfig.direction === 'asc' ? 1 : -1;

      // Compare values
      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [results.rows, sortConfig]);

  const handleSort = (columnIndex: number) => {
    setSortConfig((current) => {
      if (current?.column === columnIndex) {
        return current.direction === 'asc'
          ? { column: columnIndex, direction: 'desc' }
          : null;
      }
      return { column: columnIndex, direction: 'asc' };
    });
  };

  const handleCopyCell = (value: any) => {
    const text = value === null ? 'NULL' : String(value);
    clipboard.copy(text);
    showNotification({
      message: 'Cell value copied',
      color: 'green',
    });
  };

  const handleCopyRow = (row: any[]) => {
    const text = row.map(v => v === null ? 'NULL' : String(v)).join('\t');
    clipboard.copy(text);
    showNotification({
      message: 'Row copied',
      color: 'green',
    });
  };

  const handleExportCsv = () => {
    // Create CSV manually
    let csv = '';

    // Add headers
    csv += `${results.columns.map(col => {
      // Quote if contains comma, newline, or quote
      if (col.includes(',') || col.includes('\n') || col.includes('"')) {
        return `"${col.replace(/"/g, '""')}"`;
      }
      return col;
    }).join(',')}\n`;

    // Add data rows
    results.rows.forEach(row => {
      csv += `${row.map(cell => {
        const value = cell === null ? '' : String(cell);
        // Quote if contains comma, newline, or quote
        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-results-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showNotification({
      message: 'Results exported to CSV',
      color: 'green',
    });
  };

  if (results.rows.length === 0) {
    return (
      <Box className="text-center py-8 text-gray-500">
        <Text size="sm">No results returned</Text>
      </Box>
    );
  }

  // Use simple table for small results
  const isLargeResult = results.rows.length > 20 || results.columns.length > 10;

  return (
    <div className="relative">
      {/* Export button */}
      <Box className="absolute -top-10 right-0 z-10">
        <Tooltip label="Export as CSV">
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={handleExportCsv}
            className="hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <IconDownload size={14} />
          </ActionIcon>
        </Tooltip>
      </Box>

      <ScrollArea
        className={cn(
          isLargeResult ? 'max-h-96' : 'max-h-64'
        )}
        scrollbarSize={6}
      >
        <Table
          striped={false}
          highlightOnHover
          withTableBorder={false}
          className="text-xs chat-result-table"
          data-testid="ai-chat-query-result"
          styles={{
            table: {
              borderCollapse: 'collapse',
            },
            td: {
              padding: '6px 12px',
              borderBottom: '1px solid var(--mantine-color-gray-2)',
            },
            th: {
              padding: '8px 12px',
              borderBottom: '2px solid var(--mantine-color-gray-3)',
              background: 'var(--mantine-color-gray-0)',
              fontWeight: 600,
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.025em',
            },
          }}
        >
          <thead>
            <tr>
              {results.columns.map((column, index) => (
                <th key={index} className="group relative">
                  <Box className="flex items-center gap-1">
                    <Text
                      size="xs"
                      className="cursor-pointer select-none"
                      onClick={() => handleSort(index)}
                    >
                      {column}
                    </Text>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      onClick={() => handleSort(index)}
                      className={cn(
                        'opacity-0 group-hover:opacity-100 transition-opacity',
                        sortConfig?.column === index && 'opacity-100'
                      )}
                    >
                      {sortConfig?.column === index && sortConfig.direction === 'desc' ? (
                        <IconSortDescending size={12} />
                      ) : (
                        <IconSortAscending size={12} />
                      )}
                    </ActionIcon>
                  </Box>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="group">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="relative"
                    onMouseEnter={() => setHoveredCell({ row: rowIndex, col: cellIndex })}
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    <Box className="flex items-center justify-between gap-2">
                      {cell === null ? (
                        <Text c="dimmed" size="xs" fs="italic">NULL</Text>
                      ) : typeof cell === 'object' ? (
                        <Text size="xs" className="font-mono">{JSON.stringify(cell)}</Text>
                      ) : (
                        <Text size="xs">{String(cell)}</Text>
                      )}

                      {/* Copy actions */}
                      {hoveredCell?.row === rowIndex && hoveredCell?.col === cellIndex && (
                        <Menu position="bottom-end" withArrow shadow="md">
                          <Menu.Target>
                            <ActionIcon
                              size="xs"
                              variant="subtle"
                              className="opacity-0 group-hover:opacity-100"
                            >
                              <IconCopy size={12} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              leftSection={<IconCopy size={14} />}
                              onClick={() => handleCopyCell(cell)}
                            >
                              Copy cell
                            </Menu.Item>
                            <Menu.Item
                              leftSection={<IconCopy size={14} />}
                              onClick={() => handleCopyRow(row)}
                            >
                              Copy row
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      )}
                    </Box>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </ScrollArea>

      {results.truncated && (
        <Box className="text-center py-2 border-t border-gray-200 dark:border-gray-700">
          <Text size="xs" c="dimmed">
            Showing first {results.rowCount} rows
          </Text>
        </Box>
      )}
    </div>
  );
};

