import { showWarningWithAction } from '@components/app-notifications';
import { DotAnimation } from '@components/dots-animation';
import { ExportOptionsModal } from '@components/export-options-modal';
import { createComparison } from '@controllers/comparison';
import { getOrCreateTabFromComparison } from '@controllers/tab';
import { useTableExport } from '@features/tab-view/hooks';
import { TextProps, Group, ActionIcon, Button, Text, Menu, Divider, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { DataAdapterApi } from '@models/data-adapter';
import { SYSTEM_DATABASE_NAME } from '@models/data-source';
import { TabId, TabType } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { IconX, IconCopy, IconRefresh, IconChevronDown, IconScale } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { assertNeverValueType } from '@utils/typing';
import { useMemo, useCallback } from 'react';

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

  const tabs = useAppStore.use.tabs();
  const dataSources = useAppStore.use.dataSources();

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

  // Check if we can create a comparison from this tab
  const tab = tabs.get(tabId);

  // For file-based sources, we can create comparisons from any table
  // For db-based sources, we only allow tables and views (not other object types)
  const canCreateComparison =
    tab?.type === 'data-source' &&
    (tab.dataSourceType === 'file' ||
      (tab.dataSourceType === 'db' && (tab.objectType === 'table' || tab.objectType === 'view')));

  /**
   * Handle creating a comparison with this table as Source A
   */
  const handleCreateComparison = useCallback(() => {
    if (!tab || tab.type !== 'data-source') {
      return;
    }

    const dataSource = dataSources.get(tab.dataSourceId);
    if (!dataSource) {
      showWarningWithAction({
        title: 'Cannot create comparison',
        message: 'Could not find the data source',
      });
      return;
    }

    try {
      let sourceA;

      if (tab.dataSourceType === 'file') {
        // For file-based sources, use the system database
        // File types include: csv, json, parquet, xlsx-sheet
        if (
          dataSource.type !== 'csv' &&
          dataSource.type !== 'json' &&
          dataSource.type !== 'parquet' &&
          dataSource.type !== 'xlsx-sheet'
        ) {
          showWarningWithAction({
            title: 'Cannot create comparison',
            message: 'Invalid data source type',
          });
          return;
        }

        // Files are loaded into the system database with their table name
        sourceA = {
          type: 'table' as const,
          tableName: tabName,
          schemaName: 'main',
          databaseName: SYSTEM_DATABASE_NAME,
        };
      } else if (tab.dataSourceType === 'db') {
        // For database sources
        if (dataSource.type !== 'remote-db' && dataSource.type !== 'attached-db') {
          showWarningWithAction({
            title: 'Cannot create comparison',
            message: 'Invalid database source type',
          });
          return;
        }

        sourceA = {
          type: 'table' as const,
          tableName: tabName,
          schemaName: tab.schemaName,
          databaseName: dataSource.dbName,
        };
      } else {
        showWarningWithAction({
          title: 'Cannot create comparison',
          message: 'Unsupported data source type',
        });
        return;
      }

      const newComparison = createComparison('Comparison', {
        sourceA,
        sourceB: null,
        joinColumns: [],
        joinKeyMappings: {},
        columnMappings: {},
        excludedColumns: [],
        filterMode: 'common',
        commonFilter: null,
        filterA: null,
        filterB: null,
        showOnlyDifferences: true,
        compareMode: 'strict',
        algorithm: 'auto',
      });

      getOrCreateTabFromComparison(newComparison, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showWarningWithAction({
        title: 'Failed to create comparison',
        message,
      });
    }
  }, [tab, dataSources, tabName]);

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

        case 'comparison': {
          return (
            <Text {...textDefaultProps} c="text-error">
              Comparison failed. Check your configuration and sources.
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
        {canCreateComparison && (
          <ActionIcon
            size={16}
            onClick={handleCreateComparison}
            disabled={disableCopyAndExport}
            data-testid={setDataTestId('create-comparison-button')}
          >
            <IconScale size={16} />
          </ActionIcon>
        )}
        <Tooltip label="Copy table to clipboard">
          <ActionIcon
            data-testid={setDataTestId('copy-table-button')}
            size={16}
            onClick={copyTableToClipboard}
            disabled={disableCopyAndExport}
          >
            <IconCopy />
          </ActionIcon>
        </Tooltip>

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
