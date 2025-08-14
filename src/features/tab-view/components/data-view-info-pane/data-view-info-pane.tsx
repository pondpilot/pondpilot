import { DotAnimation } from '@components/dots-animation';
import { ExportOptionsModal } from '@components/export-options-modal';
import { useTableExport } from '@features/tab-view/hooks';
import { TextProps, Group, ActionIcon, Button, Text, Menu, Divider } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { DataAdapterApi } from '@models/data-adapter';
import { TabId, TabType } from '@models/tab';
import { IconX, IconCopy, IconRefresh, IconChevronDown } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { assertNeverValueType } from '@utils/typing';
import { useMemo } from 'react';

import { ColRowCount } from './components/col-row-count';

interface DataViewInfoPaneProps {
  dataAdapter: DataAdapterApi;
  tabType: TabType;
  tabId: TabId;
}

export const DataViewInfoPane = ({ dataAdapter, tabType, tabId }: DataViewInfoPaneProps) => {
  /**
   * Hooks
   */
  const {
    copyTableToClipboard,
    exportTableToCSV,
    openExportOptions,
    closeExportOptions,
    handleExport,
    exportModalOpen,
    tabName,
  } = useTableExport(dataAdapter, tabId);

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

        case 'schema-browser': {
          return (
            <Text {...textDefaultProps} c="text-error">
              Schema browser error.
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
    <Group justify="space-between" className="h-7 my-2 px-3">
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
        {hasDataSourceError && (
          <ActionIcon size={16} onClick={dataAdapter.reset}>
            <IconRefresh />
          </ActionIcon>
        )}
      </Group>
      <Group className="h-full">
        <ActionIcon
          data-testid={setDataTestId('copy-table-button')}
          size={16}
          onClick={copyTableToClipboard}
          disabled={disableCopyAndExport}
        >
          <IconCopy />
        </ActionIcon>

        <Menu shadow="md" position="bottom-end">
          <Menu.Target>
            <Button
              disabled={disableCopyAndExport}
              rightSection={<IconChevronDown size={14} />}
              data-testid={setDataTestId('export-table-button')}
            >
              Export
            </Button>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item
              onClick={exportTableToCSV}
              data-testid={setDataTestId('export-table-csv-menu-item')}
            >
              CSV
            </Menu.Item>
            <Divider />
            <Menu.Item
              onClick={openExportOptions}
              data-testid={setDataTestId('export-table-advanced-menu-item')}
            >
              Advanced...
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <ExportOptionsModal
        opened={exportModalOpen}
        onClose={closeExportOptions}
        onExport={handleExport}
        filename={tabName}
        dataAdapter={dataAdapter}
      />
    </Group>
  );
};
