import { Center, Group, Stack, Text } from '@mantine/core';
import { DataAdapterApi } from '@models/data-adapter';
import { IconAlertTriangle, IconTableColumn } from '@tabler/icons-react';
import { formatNumber } from '@utils/helpers';
import { cn } from '@utils/ui/styles';
import { useCallback, useRef, useState } from 'react';

import { ColumnDetailPanel, ColumnDetailPanelHandle } from './components/column-detail-panel';
import { SummaryPanel } from './components/summary-panel';
import { useMetadataStats } from './hooks';

export interface MetadataViewProps {
  dataAdapter: DataAdapterApi;
}

/**
 * Metadata view displays column-level statistics and distributions
 * for the current dataset. Composed of a left Summary panel and a
 * right Detail panel with horizontally scrollable column cards.
 */
export const MetadataView = ({ dataAdapter }: MetadataViewProps) => {
  const { currentSchema, rowCountInfo } = dataAdapter;
  const columns = currentSchema;

  const {
    columnStats,
    columnDistributions,
    isLoading,
    loadingDistributions,
    isSupported,
    errors,
  } = useMetadataStats(dataAdapter);

  const [selectedColumn, setSelectedColumn] = useState<string | undefined>();
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const detailPanelRef = useRef<ColumnDetailPanelHandle>(null);

  const handleColumnClick = useCallback(
    (columnName: string) => {
      setSelectedColumn(columnName);
      detailPanelRef.current?.scrollToColumn(columnName);
    },
    [],
  );

  const handlePillClick = useCallback(
    (columnName: string) => {
      detailPanelRef.current?.scrollToColumn(columnName);
    },
    [],
  );

  // Empty dataset: no columns or no rows
  if (columns.length === 0) {
    return (
      <Center className="h-full">
        <Stack align="center" gap="xs">
          <IconTableColumn size={32} stroke={1} />
          <Text size="sm" c="dimmed">
            No columns to display
          </Text>
        </Stack>
      </Center>
    );
  }

  // Data source does not support metadata stats
  if (!isSupported) {
    return (
      <Center className="h-full">
        <Stack align="center" gap="xs">
          <IconTableColumn size={32} stroke={1} />
          <Text size="sm" c="dimmed">
            Metadata stats are not available for this data source
          </Text>
        </Stack>
      </Center>
    );
  }

  // Stats fetch failed entirely
  const statsError = errors.get('__stats__');
  if (statsError && !isLoading) {
    return (
      <Center className="h-full">
        <Stack align="center" gap="xs">
          <IconAlertTriangle size={32} stroke={1} />
          <Text size="sm" c="dimmed">
            Failed to load column statistics
          </Text>
          <Text size="xs" c="dimmed">
            {statsError}
          </Text>
        </Stack>
      </Center>
    );
  }

  const rowCount =
    rowCountInfo.realRowCount ?? rowCountInfo.estimatedRowCount ?? rowCountInfo.availableRowCount;
  const isEstimated = rowCountInfo.realRowCount === null;

  return (
    <div className="flex flex-col h-full">
      {/* Dataset-level info header with scroll indicator pills */}
      <div className="shrink-0 px-4 py-1 flex items-center">
        <Text size="sm" c="text-secondary" className="font-medium">
          {columns.length} column{columns.length !== 1 ? 's' : ''},{' '}
          {formatNumber(rowCount)}
          {isEstimated ? '+' : ''} row{rowCount !== 1 ? 's' : ''}
        </Text>
        {columns.length > 1 && (
          <Group gap={4} wrap="nowrap" className="ml-auto">
            {columns.map((column) => (
              <button
                key={column.name}
                type="button"
                title={column.name}
                onClick={() => handlePillClick(column.name)}
                className={cn(
                  'h-1.5 w-4 rounded-full transition-colors cursor-pointer border-0 p-0',
                  visibleColumns.has(column.name)
                    ? 'bg-iconAccent-light dark:bg-iconAccent-dark opacity-60'
                    : 'bg-transparent016-light dark:bg-transparent016-dark',
                )}
              />
            ))}
          </Group>
        )}
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Summary panel */}
        <div className="shrink-0 w-[450px] border-r border-borderPrimary-light dark:border-borderPrimary-dark overflow-hidden">
          <SummaryPanel
            columns={columns}
            columnStats={columnStats}
            columnDistributions={columnDistributions}
            isLoading={isLoading}
            loadingDistributions={loadingDistributions}
            errors={errors}
            onColumnClick={handleColumnClick}
            selectedColumn={selectedColumn}
          />
        </div>

        {/* Right: Detail panel */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <ColumnDetailPanel
            ref={detailPanelRef}
            columns={columns}
            columnStats={columnStats}
            columnDistributions={columnDistributions}
            loadingDistributions={loadingDistributions}
            errors={errors}
            onVisibleColumnsChange={setVisibleColumns}
          />
        </div>
      </div>
    </div>
  );
};
