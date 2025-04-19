import { DotAnimation } from '@components/dots-animation';
import { TextProps, Group, ActionIcon, Button, Text } from '@mantine/core';
import { IconX, IconCopy } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { useMemo } from 'react';
import { useTableExport } from '@features/tab-view/hooks';
import { DataAdapterApi } from '@models/data-adapter';
import { ColRowCount } from './components/col-row-count';

interface DataViewInfoPaneProps {
  dataAdapterApi: DataAdapterApi;
}
export const DataViewInfoPane = ({ dataAdapterApi }: DataViewInfoPaneProps) => {
  const { copyTableToClipboard, exportTableToCSV } = useTableExport(dataAdapterApi);

  const dataAdapterState = {};
  // Common state
  const hasData = true;
  const useStaleData = true;
  const isFetching = true;

  // Content props
  const isSorting = true;
  const rowCount = 1;
  const columnCount = 2;
  const isEstimatedRowCount = true;

  /**
   * Consts
   */
  const showLoader = isSorting || isFetching;

  // Case 1: No data, no stale data - DataAdapter returns isFetching: true => show global overlay but if not = we want to show loading state
  // - Show text "Data is fetching" <loader>
  // - Do NOT show row info
  // - Do NOT show copy/export buttons

  // Case 2: Data available, stale data present - DataAdapter returns isFetching: false
  // - Do NOT show text status and loader
  // - Show row info
  // - Show copy/export buttons

  // Case 3: Data available, stale data present, user triggered sorting => isSorting: true && isFetching: true
  // - Show text "Stale data. Sorting" <loader>
  // - Show row info
  // - Show copy/export buttons

  // Case 4: Data available, stale data present, user triggered pagination => isFetching: true
  // - Show text "Fetching data" <loader>
  // - Show row info
  // - Show copy/export buttons

  const statusText = useMemo(() => {
    const textDefaultProps: TextProps = {
      className: 'text-sm font-medium',
      c: 'text-secondary',
    };
    if (!hasData && isFetching) {
      // Case 1: No data, no stale data - DataAdapter is fetching

      return <Text {...textDefaultProps}>Data is fetching.</Text>;
    }
    if (hasData && useStaleData && !isFetching) {
      // Case 2: Has data, has stale data, not fetching

      return null;
    }
    if (hasData && useStaleData && isSorting && isFetching) {
      // Case 3: Has data, stale data, sorting

      return (
        <Text {...textDefaultProps} c="text-warning">
          Stale data. Sorting
          <DotAnimation />
        </Text>
      );
    }
    if (hasData && useStaleData && isFetching) {
      // Case 4: Has data, stale data, pagination/fetching

      return (
        <Text {...textDefaultProps} c="text-warning">
          Stale data. Fetching
          <DotAnimation />
        </Text>
      );
    }
    return null;
  }, [hasData, useStaleData, isFetching, isSorting]);

  return (
    <Group justify="space-between" className={cn('h-7 my-2 px-3')}>
      <Group gap={4}>
        {hasData && <ColRowCount rowCount={rowCount} columnCount={rowCount} isEstimatedRowCount />}
        {statusText}

        {/* {showLoader && <Loader size={14} color="text-secondary" />} */}
        {showLoader && (
          <ActionIcon size={16}>
            <IconX />
          </ActionIcon>
        )}
      </Group>
      <Group className="h-full">
        <ActionIcon size={16} onClick={copyTableToClipboard}>
          <IconCopy />
        </ActionIcon>
        <Button onClick={exportTableToCSV} color="background-tertiary" c="text-primary">
          <Group gap={2}>Export .csv</Group>
        </Button>
      </Group>
    </Group>
  );
};
