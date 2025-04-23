import { DotAnimation } from '@components/dots-animation';
import { TextProps, Group, ActionIcon, Button, Text } from '@mantine/core';
import { IconX, IconCopy } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { useMemo } from 'react';
import { useTableExport } from '@features/tab-view/hooks';
import { DataAdapterApi } from '@models/data-adapter';
import { useDebouncedValue } from '@mantine/hooks';
import { TabType } from '@models/tab';
import { assertNeverValueType } from '@utils/typing';
import { setDataTestId } from '@utils/test-id';
import { ColRowCount } from './components/col-row-count';

interface DataViewInfoPaneProps {
  dataAdapter: DataAdapterApi;
  tabType: TabType;
}

export const DataViewInfoPane = ({ dataAdapter, tabType }: DataViewInfoPaneProps) => {
  /**
   * Hooks
   */
  const { copyTableToClipboard, exportTableToCSV } = useTableExport(dataAdapter);

  /**
   * Computed data source state
   */
  const hasData = dataAdapter.currentSchema.length > 0;
  const hasActualData = hasData && !dataAdapter.isStale;
  const hasStaleData = hasData && dataAdapter.isStale;

  const hasDataSourceError = dataAdapter.dataSourceError.length > 0;
  const [isFetching] = useDebouncedValue(dataAdapter.isFetchingData, 100);
  const [isSorting] = useDebouncedValue(dataAdapter.isSorting, 50);

  const { realRowCount, estimatedRowCount, availableRowCount } = dataAdapter.rowCountInfo;
  const isEstimatedRowCount = realRowCount === null;
  const rowCountToShow = realRowCount || estimatedRowCount || availableRowCount;
  const columnCount = dataAdapter.currentSchema.length;

  // Cancel button is shown only when data is available because, when no
  // data present, we show a big overlay with cancel button
  const showCancelButton = (isFetching || isSorting) && hasData && !hasDataSourceError;
  const disableCopyAndExport = !hasData || hasDataSourceError;

  /**
   * Memoized status message
   */
  const statusMessage = useMemo(() => {
    const textDefaultProps: TextProps = {
      className: 'text-sm font-medium',
      c: 'text-secondary',
    };

    if (hasDataSourceError) {
      if (!hasActualData && !hasStaleData) return null;

      switch (tabType) {
        case 'data-source': {
          return (
            <Text {...textDefaultProps} c="text-error">
              Data source read error
            </Text>
          );
        }
        case 'script': {
          return (
            <Text {...textDefaultProps} c="text-error">
              Query error. Review and try again.
            </Text>
          );
        }

        default:
          assertNeverValueType(tabType);
          break;
      }
    }

    if (isSorting) {
      return (
        <Text {...textDefaultProps} c="text-warning">
          Sorting
          <DotAnimation />
        </Text>
      );
    }

    if (hasStaleData) {
      return (
        <Text {...textDefaultProps} c="text-warning">
          Stale data
          {isFetching && <DotAnimation />}
        </Text>
      );
    }

    if (!hasActualData) {
      return null;
    }

    if (isFetching) {
      return (
        <Text {...textDefaultProps} c="text-warning">
          Fetching data
          <DotAnimation />
        </Text>
      );
    }

    return null;
  }, [hasActualData, hasStaleData, isFetching, isSorting, hasDataSourceError, tabType]);

  return (
    <Group justify="space-between" className={cn('h-7 my-2 px-3')}>
      <Group gap={4}>
        {hasData && (
          <ColRowCount
            rowCount={rowCountToShow}
            columnCount={columnCount}
            isEstimatedRowCount={isEstimatedRowCount}
          />
        )}
        {statusMessage}
        {showCancelButton && (
          <ActionIcon size={16} onClick={dataAdapter.cancelDataRead}>
            <IconX />
          </ActionIcon>
        )}
      </Group>
      <Group className="h-full">
        <ActionIcon size={16} onClick={copyTableToClipboard} disabled={disableCopyAndExport}>
          <IconCopy />
        </ActionIcon>
        <Button
          onClick={exportTableToCSV}
          disabled={disableCopyAndExport}
          color="background-tertiary"
          c="text-primary"
          data-testid={setDataTestId('export-table-csv-button')}
        >
          <Group gap={2}>Export CSV</Group>
        </Button>
      </Group>
    </Group>
  );
};
