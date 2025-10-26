import { Table, ScrollArea, Text, Group, Stack, Box, Progress } from '@mantine/core';
import {
  IconSearch,
  IconArrowsSort,
  IconFilter,
  IconChevronUp,
  IconChevronDown,
} from '@tabler/icons-react';
import React, { useMemo } from 'react';

import { ComparisonResultRow } from '../../hooks/use-comparison-results';

interface ComparisonTableProps {
  rows: ComparisonResultRow[];
  columns: string[];
  statusColumns: string[];
  keyColumns: string[];
  compareColumns: string[];
}

interface ColumnStats {
  name: string;
  colA: string;
  colB: string;
  status: string;
  totalRows: number;
  differentRows: number;
  percentDifferent: number;
}

export const ComparisonTable = ({
  rows,
  columns,
  statusColumns: _statusColumns,
  keyColumns,
  compareColumns,
}: ComparisonTableProps) => {
  // Calculate statistics for each column
  const columnStats = useMemo(() => {
    const stats: ColumnStats[] = [];

    compareColumns.forEach((colName) => {
      const colA = `${colName}_a`;
      const colB = `${colName}_b`;
      const statusCol = `${colName}_status`;

      if (columns.includes(colA) && columns.includes(colB) && columns.includes(statusCol)) {
        // Count rows where this specific column differs
        const differentRows = rows.filter((row) => {
          const status = row[statusCol] as string;
          return status === 'modified' || status === 'added' || status === 'removed';
        }).length;

        const percentDifferent = rows.length > 0 ? (differentRows / rows.length) * 100 : 0;

        stats.push({
          name: colName,
          colA,
          colB,
          status: statusCol,
          totalRows: rows.length,
          differentRows,
          percentDifferent,
        });
      }
    });

    return stats;
  }, [columns, compareColumns, rows]);

  if (rows.length === 0) {
    return (
      <div className="p-8 text-center">
        <Text c="dimmed">No rows to display</Text>
      </div>
    );
  }

  return (
    <ScrollArea>
      <Table
        striped
        highlightOnHover
        withTableBorder
        withColumnBorders
        style={{ fontSize: '0.875rem' }}
      >
        <Table.Thead>
          {/* Main Column Headers with Visual Diff Indicators */}
          <Table.Tr style={{ backgroundColor: '#fafafa' }}>
            {/* Key Column Headers */}
            {keyColumns.map((keyCol) => (
              <Table.Th key={keyCol} style={{ minWidth: '120px', verticalAlign: 'top' }}>
                <Group gap="xs">
                  <IconSearch size={14} style={{ color: '#666' }} />
                  <Text size="sm" fw={600} c="dimmed">
                    {keyCol.replace('_key_', '').toUpperCase()}
                  </Text>
                  <IconArrowsSort size={14} style={{ color: '#999', cursor: 'pointer' }} />
                  <IconFilter size={14} style={{ color: '#999', cursor: 'pointer' }} />
                </Group>
              </Table.Th>
            ))}

            {/* Compared Column Headers with Diff Indicators */}
            {columnStats.map((col) => (
              <Table.Th key={col.name} colSpan={2} style={{ minWidth: '240px', padding: '12px' }}>
                <Stack gap="xs">
                  <Group gap="xs" justify="space-between">
                    <Text size="sm" fw={600} c="dimmed">
                      {col.name.toUpperCase()}
                    </Text>
                    <Group gap="xs">
                      <IconFilter size={14} style={{ color: '#999', cursor: 'pointer' }} />
                    </Group>
                  </Group>

                  {/* Visual Diff Indicator */}
                  <Box>
                    <Progress.Root size="sm">
                      <Progress.Section
                        value={100 - col.percentDifferent}
                        color="green"
                        title="Matching"
                      />
                      <Progress.Section
                        value={col.percentDifferent}
                        color="pink"
                        title="Different"
                      />
                    </Progress.Root>
                  </Box>

                  {/* Percentage Different */}
                  <Group gap="xs" justify="center">
                    <Text size="xs" c="dimmed" fw={500}>
                      {Math.round(col.percentDifferent)} % different
                    </Text>
                    <Text size="xs" c="dimmed">
                      =
                    </Text>
                  </Group>
                </Stack>
              </Table.Th>
            ))}
          </Table.Tr>

          {/* Sub-column Headers (A & B) */}
          <Table.Tr style={{ backgroundColor: '#fafafa' }}>
            {keyColumns.map((keyCol) => (
              <Table.Th key={`sub_${keyCol}`}></Table.Th>
            ))}

            {columnStats.map((col) => (
              <React.Fragment key={`subheader_${col.name}`}>
                <Table.Th style={{ padding: '8px', textAlign: 'center' }}>
                  <Group gap="xs" justify="center">
                    <Text size="xs" c="dimmed" fw={500}>
                      A
                    </Text>
                    <IconChevronUp size={12} style={{ color: '#999', cursor: 'pointer' }} />
                    <IconFilter size={12} style={{ color: '#999', cursor: 'pointer' }} />
                  </Group>
                </Table.Th>
                <Table.Th style={{ padding: '8px', textAlign: 'center' }}>
                  <Group gap="xs" justify="center">
                    <Text size="xs" c="dimmed" fw={500}>
                      B
                    </Text>
                    <IconChevronDown size={12} style={{ color: '#999', cursor: 'pointer' }} />
                    <IconFilter size={12} style={{ color: '#999', cursor: 'pointer' }} />
                  </Group>
                </Table.Th>
              </React.Fragment>
            ))}
          </Table.Tr>
        </Table.Thead>

        <Table.Tbody>
          {rows.map((row, idx) => {
            return (
              <Table.Tr key={idx}>
                {/* Key Columns */}
                {keyColumns.map((keyCol) => (
                  <Table.Td key={keyCol} style={{ padding: '8px 12px' }}>
                    <Text size="sm" fw={400} c="dark">
                      {String(row[keyCol] ?? '')}
                    </Text>
                  </Table.Td>
                ))}

                {/* Comparison Columns */}
                {columnStats.map((col) => {
                  const status = row[col.status] as string;
                  const isDifferent =
                    status === 'modified' || status === 'added' || status === 'removed';

                  const valueA = row[col.colA];
                  const valueB = row[col.colB];
                  const isNullA = valueA === null || valueA === undefined;
                  const isNullB = valueB === null || valueB === undefined;

                  return (
                    <React.Fragment key={`${col.name}_${idx}`}>
                      {/* Source A Cell */}
                      <Table.Td
                        style={{
                          padding: '8px 12px',
                          backgroundColor: isDifferent ? '#ffe0e6' : 'transparent',
                        }}
                      >
                        <Text
                          size="sm"
                          fw={400}
                          c={isNullA ? 'dimmed' : 'dark'}
                          fs={isNullA ? 'italic' : 'normal'}
                        >
                          {isNullA ? 'NULL' : String(valueA)}
                        </Text>
                      </Table.Td>

                      {/* Source B Cell */}
                      <Table.Td
                        style={{
                          padding: '8px 12px',
                          backgroundColor: isDifferent ? '#ffe0e6' : 'transparent',
                        }}
                      >
                        <Text
                          size="sm"
                          fw={400}
                          c={isNullB ? 'dimmed' : 'dark'}
                          fs={isNullB ? 'italic' : 'normal'}
                        >
                          {isNullB ? 'NULL' : String(valueB)}
                        </Text>
                      </Table.Td>
                    </React.Fragment>
                  );
                })}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
};
