import { showSuccess } from '@components/app-notifications';
import { NamedIcon, IconType } from '@components/named-icon';
import { Text, Box, ActionIcon, Tooltip, Menu, Group, Badge } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { QueryResults } from '@models/ai-chat';
import { IconCopy, IconDownload, IconTriangleInvertedFilled } from '@tabler/icons-react';
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

  // Calculate column widths based on content
  const columnWidths = useMemo(() => {
    return results.columns.map((column, colIndex) => {
      // Get sample values to determine width
      const sampleValues = results.rows.slice(0, 20).map((row) => row[colIndex]);
      const columnNameLength = column.length;

      // Check max content length
      const maxContentLength = Math.max(
        columnNameLength,
        ...sampleValues.map((val) =>
          val === null
            ? 4 // 'NULL'
            : typeof val === 'object'
              ? JSON.stringify(val).length
              : String(val).length,
        ),
      );

      // Calculate width with min/max bounds
      // ~8px per character + padding + icon space
      const calculatedWidth = Math.min(400, Math.max(100, maxContentLength * 8 + 60));

      return `${calculatedWidth}px`;
    });
  }, [results]);

  // Detect column types based on data
  const columnTypes = useMemo(() => {
    return results.columns.map((column, colIndex) => {
      const columnLower = column.toLowerCase();
      const sampleValues = results.rows.slice(0, 10).map((row) => row[colIndex]);
      const nonNullValues = sampleValues.filter((v) => v != null);

      // Check for temporal columns
      const temporalKeywords = [
        'date',
        'time',
        'year',
        'month',
        'day',
        'hour',
        'minute',
        'timestamp',
        'created',
        'updated',
        'modified',
      ];
      const hasTemporalName = temporalKeywords.some((keyword) => columnLower.includes(keyword));

      if (
        hasTemporalName ||
        sampleValues.some((value) => {
          if (value == null) return false;
          const str = String(value);
          return /^\d{4}-\d{2}-\d{2}/.test(str) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(str);
        })
      ) {
        return 'column-timestamp';
      }

      // Check for numeric columns
      if (nonNullValues.length > 0) {
        const numericCount = nonNullValues.filter((v) => typeof v === 'number').length;
        if (numericCount / nonNullValues.length >= 0.8) {
          // Check if all numbers are integers
          const allIntegers = nonNullValues
            .filter((v) => typeof v === 'number')
            .every((v) => Number.isInteger(v as number));
          return allIntegers ? 'column-integer' : 'column-float';
        }
      }

      // Check for boolean
      if (nonNullValues.length > 0) {
        const booleanValues = ['true', 'false', '1', '0', 't', 'f', 'yes', 'no'];
        const allBoolean = nonNullValues.every(
          (v) => typeof v === 'boolean' || booleanValues.includes(String(v).toLowerCase()),
        );
        if (allBoolean) return 'column-boolean';
      }

      // Default to string
      return 'column-string';
    });
  }, [results]);

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
        return current.direction === 'asc' ? { column: columnIndex, direction: 'desc' } : null;
      }
      return { column: columnIndex, direction: 'asc' };
    });
  };

  const handleCopyCell = (value: any) => {
    const text = value === null ? 'NULL' : String(value);
    clipboard.copy(text);
    showSuccess({ title: 'Cell value copied', message: '' });
  };

  const handleCopyRow = (row: any[]) => {
    const text = row.map((v) => (v === null ? 'NULL' : String(v))).join('\t');
    clipboard.copy(text);
    showSuccess({ title: 'Row copied', message: '' });
  };

  const handleExportCsv = () => {
    // Create CSV manually
    let csv = '';

    // Add headers
    csv += `${results.columns
      .map((col) => {
        // Quote if contains comma, newline, or quote
        if (col.includes(',') || col.includes('\n') || col.includes('"')) {
          return `"${col.replace(/"/g, '""')}"`;
        }
        return col;
      })
      .join(',')}\n`;

    // Add data rows
    results.rows.forEach((row) => {
      csv += `${row
        .map((cell) => {
          const value = cell === null ? '' : String(cell);
          // Quote if contains comma, newline, or quote
          if (value.includes(',') || value.includes('\n') || value.includes('"')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(',')}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-results-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showSuccess({ title: 'Results exported to CSV', message: '' });
  };

  if (results.rows.length === 0) {
    return (
      <div className="w-full">
        <div className="w-full h-10 flex justify-center items-center text-textSecondary-light dark:text-textSecondary-dark border border-borderLight-light dark:border-borderLight-dark bg-backgroundTertiary-light dark:bg-backgroundTertiary-dark">
          <Text size="sm" c="text-secondary">
            No results
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header with results count and export button */}
      <Box className="bg-backgroundTertiary-light dark:bg-backgroundTertiary-dark px-4 py-2 border border-borderLight-light dark:border-borderLight-dark border-b-0">
        <Group justify="space-between">
          <Group gap="xs">
            <Badge size="sm" variant="dot" color="green" className="result-badge">
              Results
            </Badge>
            <Text size="xs" c="dimmed">
              {results.rows.length} rows
            </Text>
          </Group>
          <Tooltip label="Export as CSV">
            <ActionIcon
              size="sm"
              variant="subtle"
              onClick={handleExportCsv}
              className="hover:bg-transparent008-light dark:hover:bg-transparent008-dark"
            >
              <IconDownload size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>

      {/* Table container */}
      <div className="overflow-auto border border-borderLight-light dark:border-borderLight-dark border-t-0 max-h-96">
        <div className="min-w-fit">
          {/* Table header */}
          <div className="sticky top-0 z-10 bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark">
            <div className="bg-backgroundTertiary-light dark:bg-backgroundTertiary-dark">
              <div className="grid" style={{ gridTemplateColumns: columnWidths.join(' ') }}>
                {results.columns.map((column, index) => (
                  <button
                    key={index}
                    type="button"
                    className={cn(
                      'flex items-center gap-2 px-3 py-[11px] h-[40px] text-sm font-medium',
                      'text-textPrimary-light dark:text-textPrimary-dark',
                      'cursor-pointer group overflow-hidden',
                      'bg-transparent border-0 hover:bg-transparent',
                      'border-r border-borderLight-light dark:border-borderLight-dark',
                      index === results.columns.length - 1 && 'border-r-0',
                    )}
                    onClick={() => handleSort(index)}
                  >
                    <div className="text-iconDefault-light dark:text-iconDefault-dark flex-shrink-0">
                      <NamedIcon iconType={columnTypes[index] as IconType} size={16} />
                    </div>
                    <Text
                      size="sm"
                      fw={500}
                      c="text-contrast"
                      truncate="end"
                      className="flex-1 text-left"
                    >
                      {column}
                    </Text>
                    <IconTriangleInvertedFilled
                      size={8}
                      className={cn(
                        'opacity-0 text-iconDefault-light dark:text-iconDefault-dark flex-shrink-0',
                        'group-hover:opacity-100',
                        sortConfig?.column === index && 'opacity-100',
                        sortConfig?.column === index &&
                          sortConfig.direction === 'desc' &&
                          'rotate-180',
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table body */}
          <div>
            {sortedRows.map((row, rowIndex) => {
              const oddRow = rowIndex % 2 !== 0;
              const lastRow = rowIndex === sortedRows.length - 1;

              return (
                <div
                  key={rowIndex}
                  className={cn(
                    'grid border-b border-borderLight-light dark:border-borderLight-dark',
                    !oddRow && 'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark',
                    oddRow && 'bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark',
                    lastRow && 'border-b',
                  )}
                  style={{ gridTemplateColumns: columnWidths.join(' ') }}
                >
                  {row.map((cell, cellIndex) => {
                    const isLastCell = cellIndex === row.length - 1;
                    const isNumber = typeof cell === 'number';

                    return (
                      <div
                        key={cellIndex}
                        className={cn(
                          'relative overflow-hidden border-r border-borderLight-light dark:border-borderLight-dark',
                          'group/cell flex items-center h-[40px] px-3',
                          isLastCell && 'border-r-0',
                        )}
                        onMouseEnter={() => setHoveredCell({ row: rowIndex, col: cellIndex })}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        <div
                          className={cn(
                            'text-sm overflow-hidden text-ellipsis whitespace-nowrap flex-1',
                            isNumber && 'text-right font-mono',
                            cell === null &&
                              'italic text-textSecondary-light dark:text-textSecondary-dark',
                          )}
                        >
                          {cell === null ? (
                            'NULL'
                          ) : typeof cell === 'object' ? (
                            <span className="font-mono">{JSON.stringify(cell)}</span>
                          ) : (
                            String(cell)
                          )}
                        </div>

                        {/* Copy actions */}
                        {hoveredCell?.row === rowIndex && hoveredCell?.col === cellIndex && (
                          <Menu position="bottom-end" withArrow shadow="md">
                            <Menu.Target>
                              <ActionIcon
                                size="xs"
                                variant="subtle"
                                className="opacity-0 group-hover/cell:opacity-100 ml-2"
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
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {results.truncated && (
        <Box className="text-center py-2 mt-2">
          <Text size="xs" c="dimmed">
            Showing first {results.rowCount} rows
          </Text>
        </Box>
      )}
    </div>
  );
};
