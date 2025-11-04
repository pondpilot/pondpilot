import { DotAnimation } from '@components/dots-animation';
import { ExportOptionsModal } from '@components/export-options-modal';
import { assignComparisonSource } from '@features/comparison/utils/comparison-integration';
import { useTableExport } from '@features/tab-view/hooks';
import { ActionIcon, Button, Divider, Group, Menu, Text, TextProps, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { DataAdapterApi } from '@models/data-adapter';
import { ComparisonSource, TabId, TabType } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { IconChevronDown, IconCopy, IconRefresh, IconScale, IconX } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { assertNeverValueType } from '@utils/typing';
import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { ColRowCount } from './components/col-row-count';

interface DataViewInfoPaneProps {
  dataAdapter: DataAdapterApi;
  tabType: TabType;
  tabId: TabId;
}

type ComparisonAction =
  | { kind: 'auto'; label: string }
  | { kind: 'slot'; label: string; slot: 'A' | 'B'; mode: 'add' | 'replace' };

type ComparisonSourceDescriptor =
  | { kind: 'none' }
  | { kind: 'table'; tableName: string; schemaName?: string; databaseName?: string }
  | { kind: 'query'; sql: string; alias: string };

type ComparisonSlotState =
  | { hasComparison: false }
  | { hasComparison: true; hasSourceA: boolean; hasSourceB: boolean };

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

  const comparisonSourceDescriptor = useAppStore(
    useShallow((state): ComparisonSourceDescriptor => {
      const tab = state.tabs.get(tabId);
      if (!tab) {
        return { kind: 'none' };
      }

      if (tabType !== 'data-source') {
        return { kind: 'none' };
      }

      if (tab.type === 'data-source') {
        const dataSource = state.dataSources.get(tab.dataSourceId);
        if (!dataSource) {
          return { kind: 'none' };
        }

        if (
          tab.dataSourceType === 'db' &&
          (dataSource.type === 'attached-db' || dataSource.type === 'remote-db')
        ) {
          return {
            kind: 'table',
            tableName: tab.objectName,
            schemaName: tab.schemaName,
            databaseName: dataSource.dbName,
          };
        }

        if (
          tab.dataSourceType === 'file' &&
          dataSource.type !== 'attached-db' &&
          dataSource.type !== 'remote-db'
        ) {
          return {
            kind: 'table',
            tableName: dataSource.viewName,
            schemaName: 'main',
            databaseName: 'pondpilot',
          };
        }

        return { kind: 'none' };
      }

      return { kind: 'none' };
    }),
  );

  const comparisonSlotState = useAppStore(
    useShallow((state): ComparisonSlotState => {
      const { activeTabId } = state;
      if (!activeTabId) {
        return { hasComparison: false };
      }

      const activeTab = state.tabs.get(activeTabId);
      if (!activeTab || activeTab.type !== 'comparison') {
        return { hasComparison: false };
      }

      const comparison = state.comparisons.get(activeTab.comparisonId);
      if (!comparison) {
        return { hasComparison: false };
      }

      const { config } = comparison;
      return {
        hasComparison: true,
        hasSourceA: Boolean(config?.sourceA),
        hasSourceB: Boolean(config?.sourceB),
      };
    }),
  );

  const comparisonSource = useMemo<ComparisonSource | null>(() => {
    if (comparisonSourceDescriptor.kind === 'table') {
      return {
        type: 'table',
        tableName: comparisonSourceDescriptor.tableName,
        schemaName: comparisonSourceDescriptor.schemaName,
        databaseName: comparisonSourceDescriptor.databaseName,
      };
    }

    if (comparisonSourceDescriptor.kind === 'query') {
      return {
        type: 'query',
        sql: comparisonSourceDescriptor.sql,
        alias: comparisonSourceDescriptor.alias,
      };
    }

    return null;
  }, [comparisonSourceDescriptor]);

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
   * Comparison quick actions
   */
  const comparisonActions = useMemo<ComparisonAction[]>(() => {
    if (!comparisonSource) {
      return [];
    }

    if (!comparisonSlotState.hasComparison) {
      return [{ kind: 'auto', label: 'New comparison' }];
    }

    const { hasSourceA, hasSourceB } = comparisonSlotState;
    const actions: ComparisonAction[] = [];

    if (!hasSourceA) {
      actions.push({ kind: 'slot', slot: 'A', mode: 'add', label: 'Add as Source A' });
    }

    if (!hasSourceB) {
      actions.push({ kind: 'slot', slot: 'B', mode: 'add', label: 'Add as Source B' });
    }

    if (hasSourceA && hasSourceB) {
      actions.push({ kind: 'slot', slot: 'A', mode: 'replace', label: 'Replace Source A' });
      actions.push({ kind: 'slot', slot: 'B', mode: 'replace', label: 'Replace Source B' });
    }

    return actions;
  }, [comparisonSlotState, comparisonSource]);

  const defaultComparisonAction = useMemo<ComparisonAction | null>(() => {
    if (!comparisonSource || comparisonActions.length === 0) {
      return null;
    }

    if (!comparisonSlotState.hasComparison) {
      return comparisonActions.find((action) => action.kind === 'auto') ?? comparisonActions[0];
    }

    const { hasSourceA, hasSourceB } = comparisonSlotState;

    if (!hasSourceA) {
      const addA = comparisonActions.find(
        (action): action is Extract<ComparisonAction, { kind: 'slot'; slot: 'A' }> =>
          action.kind === 'slot' && action.slot === 'A',
      );
      if (addA) {
        return addA;
      }
    }

    if (!hasSourceB) {
      const addB = comparisonActions.find(
        (action): action is Extract<ComparisonAction, { kind: 'slot'; slot: 'B' }> =>
          action.kind === 'slot' && action.slot === 'B',
      );
      if (addB) {
        return addB;
      }
    }

    return comparisonActions[0] ?? null;
  }, [comparisonActions, comparisonSlotState, comparisonSource]);

  const extraComparisonActions = useMemo(() => {
    if (!defaultComparisonAction) {
      return comparisonActions;
    }

    return comparisonActions.filter((action) => action !== defaultComparisonAction);
  }, [comparisonActions, defaultComparisonAction]);

  const handleComparisonAction = useCallback(
    (action: ComparisonAction) => {
      if (!comparisonSource) {
        return;
      }

      // No additional notification needed - assignComparisonSource already shows warnings
      // for blocked status, and the UI already reflects successful add/replace changes.
      if (action.kind === 'auto') {
        assignComparisonSource(comparisonSource, 'auto');
      } else {
        assignComparisonSource(comparisonSource, action.slot);
      }
    },
    [comparisonSource],
  );

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
        {comparisonSource && defaultComparisonAction && (
          <Group gap={4} align="center" className="h-full">
            <Button
              variant="default"
              leftSection={<IconScale size={16} />}
              onClick={() => handleComparisonAction(defaultComparisonAction)}
              data-testid={setDataTestId('compare-button')}
            >
              Compare
            </Button>

            {extraComparisonActions.length > 0 && (
              <Menu shadow="md" position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon
                    variant="default"
                    size={32}
                    data-testid={setDataTestId('compare-button-options')}
                    aria-label="Additional comparison actions"
                  >
                    <IconChevronDown size={14} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {extraComparisonActions.map((action, index) => (
                    <Menu.Item
                      key={`${action.kind}-${index}-${action.kind === 'slot' ? action.slot : 'auto'}`}
                      onClick={() => handleComparisonAction(action)}
                      data-testid={setDataTestId(
                        action.kind === 'slot'
                          ? `compare-menu-source-${action.slot.toLowerCase()}`
                          : 'compare-menu-new',
                      )}
                    >
                      {action.label}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        )}
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

        <Tooltip label="Copy table to clipboard" position="bottom" withArrow>
          <ActionIcon
            data-testid={setDataTestId('copy-table-button')}
            size={16}
            onClick={copyTableToClipboard}
            disabled={disableCopyAndExport}
            aria-label="Copy table to clipboard"
          >
            <IconCopy />
          </ActionIcon>
        </Tooltip>
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
