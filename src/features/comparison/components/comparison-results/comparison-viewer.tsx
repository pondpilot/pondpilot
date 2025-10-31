import { showWarningWithAction, showSuccess } from '@components/app-notifications';
import { clearComparisonResults } from '@controllers/comparison';
import { getOrCreateTabFromLocalDBObject } from '@controllers/tab';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { useAppTheme } from '@hooks/use-app-theme';
import {
  Stack,
  Alert,
  LoadingOverlay,
  Paper,
  Text,
  Group,
  Badge,
  RingProgress,
  Chip,
  Divider,
  Button,
  Popover,
  TextInput,
  Checkbox,
  ScrollArea,
  ActionIcon,
  useMantineTheme,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { ComparisonId } from '@models/comparison';
import { ColumnSortSpecList, DBColumn } from '@models/db';
import { ComparisonConfig, SchemaComparisonResult, TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import {
  IconInfoCircle,
  IconPlus,
  IconMinus,
  IconPencil,
  IconCheck,
  IconX,
  IconLayoutColumns,
} from '@tabler/icons-react';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';

import {
  ComparisonResultsTable,
  ColumnDiffStats,
  ComparisonJoinColumn,
  ComparisonValueColumn,
} from './comparison-table';
import { ICON_CLASSES } from '../../constants/color-classes';
import { useComparisonResultsSimple } from '../../hooks/use-comparison-results-simple';
import { getColumnsToCompare } from '../../utils/sql-generator';
import {
  COMPARISON_STATUS_THEME,
  getStatusAccentColor,
  getStatusSurfaceColor,
  getThemeColorValue,
} from '../../utils/theme';
import type { ComparisonRowStatus } from '../../utils/theme';
import { ComparisonToolbar } from '../comparison-toolbar';

type TableConfig = {
  joinColumns: ComparisonJoinColumn[];
  valueColumns: ComparisonValueColumn[];
  rowStatusColumn: DBColumn | null;
};

interface ComparisonViewerProps {
  tabId: TabId;
  comparisonId: ComparisonId;
  config: ComparisonConfig;
  schemaComparison: SchemaComparisonResult;
  tableName: string;
  executionTime: number;
  lastRunAt: string | null;
  onReconfigure: () => void;
  onRefresh: () => void;
}

export const ComparisonViewer = ({
  tabId,
  comparisonId,
  config,
  schemaComparison,
  tableName,
  executionTime,
  lastRunAt,
  onReconfigure,
  onRefresh,
}: ComparisonViewerProps) => {
  const theme = useMantineTheme();
  const colorScheme = useAppTheme();
  const baseAlertText = getThemeColorValue(theme, 'text-primary', colorScheme === 'dark' ? 0 : 9);
  const accentAlertTitle = getThemeColorValue(theme, 'text-accent', colorScheme === 'dark' ? 2 : 6);
  const dataSources = useAppStore.use.dataSources();
  const databaseMetadata = useAppStore.use.databaseMetadata();
  const pool = useInitializedDuckDBConnectionPool();
  const handledMissingTableRef = useRef(false);
  const [isClearing, setIsClearing] = useState(false);

  const getAlertStyles = (tone: 'error' | 'accent') => {
    const titleColor =
      tone === 'error' ? getStatusAccentColor(theme, 'removed', colorScheme) : accentAlertTitle;
    return {
      title: {
        color: titleColor,
        fontWeight: 600,
      },
      message: {
        color: baseAlertText,
      },
    };
  };

  // Sorting state
  const [sort, setSort] = useState<ColumnSortSpecList>([]);

  // Filter state - default to showing only differences
  const [showAdded, setShowAdded] = useState(true);
  const [showRemoved, setShowRemoved] = useState(true);
  const [showModified, setShowModified] = useState(true);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [visibleJoinColumns, setVisibleJoinColumns] = useState<Record<string, boolean>>({});
  const [visibleValueColumns, setVisibleValueColumns] = useState<Record<string, boolean>>({});
  const [columnsPopoverOpened, setColumnsPopoverOpened] = useState(false);
  const [columnSearchQuery, setColumnSearchQuery] = useState('');

  const activeStatuses = useMemo<ComparisonRowStatus[]>(() => {
    const statuses: ComparisonRowStatus[] = [];
    if (showAdded) statuses.push('added');
    if (showRemoved) statuses.push('removed');
    if (showModified) statuses.push('modified');
    if (showUnchanged) statuses.push('same');
    return statuses;
  }, [showAdded, showRemoved, showModified, showUnchanged]);

  const compareColumns = useMemo(
    () => getColumnsToCompare(config, schemaComparison),
    [config, schemaComparison],
  );

  const handleColumnFilterChange = useCallback((columnId: string, value: string) => {
    setColumnFilters((prev) => {
      const nextValue = value;
      if (!nextValue.trim()) {
        if (!(columnId in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[columnId];
        return next;
      }
      if (prev[columnId] === nextValue) {
        return prev;
      }
      return { ...prev, [columnId]: nextValue };
    });
  }, []);

  const handleJoinColumnVisibilityChange = useCallback((columnId: string, visible: boolean) => {
    setVisibleJoinColumns((prev) => {
      if (prev[columnId] === visible) {
        return prev;
      }
      return { ...prev, [columnId]: visible };
    });
  }, []);

  const handleValueColumnVisibilityChange = useCallback((columnName: string, visible: boolean) => {
    setVisibleValueColumns((prev) => {
      if (prev[columnName] === visible) {
        return prev;
      }
      return { ...prev, [columnName]: visible };
    });
  }, []);

  // Fetch results with sorting and status filtering
  const { results, isLoading, error } = useComparisonResultsSimple(
    tableName,
    config,
    schemaComparison,
    executionTime,
    sort,
    activeStatuses,
  );

  useEffect(() => {
    if (!results) {
      return;
    }
    const { schema } = results;
    setVisibleJoinColumns((prev) => {
      let changed = false;
      const next = { ...prev };
      const activeIds = new Set<string>();
      config.joinColumns.forEach((joinKey) => {
        const schemaColumn = schema.find((column) => column.name === `_key_${joinKey}`);
        if (schemaColumn) {
          activeIds.add(schemaColumn.id);
          if (next[schemaColumn.id] === undefined) {
            next[schemaColumn.id] = true;
            changed = true;
          }
        }
      });
      Object.keys(next).forEach((id) => {
        if (!activeIds.has(id)) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [results, config.joinColumns]);

  useEffect(() => {
    setVisibleValueColumns((prev) => {
      let changed = false;
      const next = { ...prev };
      const activeNames = new Set<string>();
      compareColumns.forEach((columnName) => {
        activeNames.add(columnName);
        if (next[columnName] === undefined) {
          next[columnName] = true;
          changed = true;
        }
      });
      Object.keys(next).forEach((name) => {
        if (!activeNames.has(name)) {
          delete next[name];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [compareColumns]);

  const RESULTS_ROW_LIMIT = 1000;

  const statusTotals = results?.statusTotals ?? {
    total: 0,
    added: 0,
    removed: 0,
    modified: 0,
    same: 0,
  };

  const statusFilteredRows = results?.rows ?? [];
  const filteredRows = useMemo(() => {
    const activeFilters = Object.entries(columnFilters).filter(
      ([, value]) => value.trim().length > 0,
    );
    if (activeFilters.length === 0) {
      return statusFilteredRows;
    }
    return statusFilteredRows.filter((row) => {
      return activeFilters.every(([columnId, rawValue]) => {
        const filterValue = rawValue.trim().toLowerCase();
        if (!filterValue) {
          return true;
        }
        const cellValue = row[columnId];
        if (cellValue === null || cellValue === undefined) {
          return 'null'.includes(filterValue);
        }
        return String(cellValue).toLowerCase().includes(filterValue);
      });
    });
  }, [statusFilteredRows, columnFilters]);

  const displayedRows = filteredRows;
  const isTruncated =
    results?.filteredRowCount !== undefined &&
    results.filteredRowCount >= RESULTS_ROW_LIMIT &&
    statusTotals.total > results.filteredRowCount;

  const joinColumnOptions = useMemo(() => {
    if (!results) {
      return [] as Array<{ id: string; label: string }>;
    }
    const options: Array<{ id: string; label: string }> = [];
    for (const joinKey of config.joinColumns) {
      const schemaColumn = results.schema.find((column) => column.name === `_key_${joinKey}`);
      if (schemaColumn) {
        options.push({ id: schemaColumn.id as string, label: joinKey });
      }
    }
    return options;
  }, [config.joinColumns, results]);

  const valueColumnOptions = useMemo(
    () => compareColumns.map((columnName) => ({ id: columnName, label: columnName })),
    [compareColumns],
  );

  const normalizedColumnSearch = columnSearchQuery.trim().toLowerCase();
  const filteredJoinColumnOptions = joinColumnOptions.filter((option) =>
    option.label.toLowerCase().includes(normalizedColumnSearch),
  );
  const filteredValueColumnOptions = valueColumnOptions.filter((option) =>
    option.label.toLowerCase().includes(normalizedColumnSearch),
  );

  const columnIdToLabel = useMemo(() => {
    const map: Record<string, string> = {};
    if (!results) {
      return map;
    }
    const { schema } = results;
    for (const joinKey of config.joinColumns) {
      const schemaColumn = schema.find((column) => column.name === `_key_${joinKey}`);
      if (schemaColumn) {
        map[String(schemaColumn.id)] = joinKey;
      }
    }
    for (const columnName of compareColumns) {
      const columnA = schema.find((column) => column.name === `${columnName}_a`);
      const columnB = schema.find((column) => column.name === `${columnName}_b`);
      if (columnA) {
        map[String(columnA.id)] = `${columnName} (A)`;
      }
      if (columnB) {
        map[String(columnB.id)] = `${columnName} (B)`;
      }
    }
    return map;
  }, [results, config.joinColumns, compareColumns]);

  const activeColumnFilters = useMemo(() => {
    const entries = Object.entries(columnFilters);
    if (!entries.length) return [];
    const filters = entries
      .map(([columnId, value]) => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const label = columnIdToLabel[columnId] ?? columnId;
        return { columnId, label, value: trimmed };
      })
      .filter((item): item is { columnId: string; label: string; value: string } => Boolean(item));
    filters.sort((a, b) => a.label.localeCompare(b.label));
    return filters;
  }, [columnFilters, columnIdToLabel]);

  const hasStatusFilter = !showAdded || !showRemoved || !showModified || showUnchanged;
  const canResetFilters = hasStatusFilter || activeColumnFilters.length > 0;

  const handleResetFilters = useCallback(() => {
    setShowAdded(true);
    setShowRemoved(true);
    setShowModified(true);
    setShowUnchanged(false);
    setColumnFilters({});
  }, []);

  const handleResetColumns = useCallback(() => {
    setVisibleJoinColumns({});
    setVisibleValueColumns({});
    setColumnFilters({});
    setColumnSearchQuery('');
    setColumnsPopoverOpened(false);
  }, []);

  const handleSelectAllColumns = useCallback(
    (visible: boolean) => {
      setVisibleJoinColumns((prev) => {
        const next = { ...prev };
        joinColumnOptions.forEach((option) => {
          next[option.id] = visible;
        });
        return next;
      });
      setVisibleValueColumns((prev) => {
        const next = { ...prev };
        valueColumnOptions.forEach((option) => {
          next[option.id] = visible;
        });
        return next;
      });
    },
    [joinColumnOptions, valueColumnOptions],
  );

  const ringProgressSections = useMemo(() => {
    if (statusTotals.total === 0) {
      return [];
    }

    const sections: { value: number; color: string }[] = [];
    if (statusTotals.added > 0) {
      sections.push({
        value: (statusTotals.added / statusTotals.total) * 100,
        color: COMPARISON_STATUS_THEME.added.accentColorKey,
      });
    }
    if (statusTotals.removed > 0) {
      sections.push({
        value: (statusTotals.removed / statusTotals.total) * 100,
        color: COMPARISON_STATUS_THEME.removed.accentColorKey,
      });
    }
    if (statusTotals.modified > 0) {
      sections.push({
        value: (statusTotals.modified / statusTotals.total) * 100,
        color: COMPARISON_STATUS_THEME.modified.accentColorKey,
      });
    }
    if (statusTotals.same > 0) {
      sections.push({
        value: (statusTotals.same / statusTotals.total) * 100,
        color: COMPARISON_STATUS_THEME.same.accentColorKey,
      });
    }
    return sections;
  }, [statusTotals]);

  useEffect(() => {
    if (!error || handledMissingTableRef.current || !tableName) {
      return;
    }

    const normalizedError = error.toLowerCase();
    if (
      normalizedError.includes('does not exist') ||
      normalizedError.includes('not found') ||
      normalizedError.includes('catalog error')
    ) {
      handledMissingTableRef.current = true;
      const clearMissingTable = async () => {
        await clearComparisonResults(comparisonId, { tableNameOverride: null });
        showWarningWithAction({
          title: 'Comparison results missing',
          message:
            'The materialized table was deleted. Re-run the comparison to regenerate results.',
          action: {
            label: 'Re-run comparison',
            onClick: () => {
              onRefresh();
            },
          },
        });
      };
      clearMissingTable().catch(() => {
        // Best-effort notification; subsequent renders will surface errors again if needed
      });
    }
  }, [comparisonId, error, tableName, onRefresh]);

  const handleClearResults = useCallback(() => {
    modals.openConfirmModal({
      title: 'Clear comparison results?',
      children: (
        <Text size="sm">
          This removes the stored table <strong>{tableName}</strong>. You can re-run the comparison
          at any time to rebuild the results.
        </Text>
      ),
      labels: { confirm: 'Clear results', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          setIsClearing(true);
          await clearComparisonResults(comparisonId, {
            pool,
            tableNameOverride: tableName,
          });
          showSuccess({
            title: 'Comparison results cleared',
            message: 'The comparison has been reset to the configuration screen.',
            autoClose: 2500,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          showWarningWithAction({
            title: 'Failed to clear results',
            message,
          });
        } finally {
          setIsClearing(false);
        }
      },
    });
  }, [comparisonId, pool, tableName]);

  // Get the columns being compared
  const [tableScrollOffset, setTableScrollOffset] = useState(0);
  const handleTableScrollChange = useCallback((scrollLeft: number) => {
    setTableScrollOffset((prev) => (Math.abs(prev - scrollLeft) > 0.5 ? scrollLeft : prev));
  }, []);

  const tableConfig = useMemo<TableConfig | null>(() => {
    if (!results) return null;

    const baseSchema = results.schema;
    const totalRows = filteredRows.length;

    const rowStatusColumn = baseSchema.find((column) => column.name === '_row_status') ?? null;

    const joinColumns: ComparisonJoinColumn[] = config.joinColumns
      .map((joinKey) => {
        const sourceColumn = baseSchema.find((column) => column.name === `_key_${joinKey}`);
        if (!sourceColumn) {
          return null;
        }
        const displayColumn: DBColumn = { ...sourceColumn, name: joinKey };
        return {
          column: displayColumn,
          sortColumnName: sourceColumn.name,
        };
      })
      .filter((value): value is ComparisonJoinColumn => Boolean(value));

    const columnAByName = new Map<string, DBColumn>();
    const columnBByName = new Map<string, DBColumn>();
    const statusColumnByName = new Map<string, DBColumn>();

    baseSchema.forEach((column) => {
      if (column.name.endsWith('_a')) {
        columnAByName.set(column.name.replace(/_a$/, ''), column);
      } else if (column.name.endsWith('_b')) {
        columnBByName.set(column.name.replace(/_b$/, ''), column);
      } else if (column.name.endsWith('_status')) {
        statusColumnByName.set(column.name.replace(/_status$/, ''), column);
      }
    });

    const valueColumns = compareColumns
      .map((columnName) => {
        const columnA = columnAByName.get(columnName);
        const columnB = columnBByName.get(columnName);
        const statusColumn = statusColumnByName.get(columnName);

        if (!columnA || !columnB || !statusColumn) {
          return null;
        }

        const diffStats: ColumnDiffStats = {
          total: totalRows,
          added: 0,
          removed: 0,
          modified: 0,
          same: 0,
        };

        return {
          displayName: columnName,
          columnA,
          columnB,
          statusColumn,
          diffStats,
        };
      })
      .filter(Boolean) as ComparisonValueColumn[];

    const filteredJoinColumns = joinColumns.filter(
      ({ column }) => visibleJoinColumns[column.id] !== false,
    );
    const filteredValueColumns = valueColumns.filter(
      (column) => visibleValueColumns[column.displayName] !== false,
    );

    filteredRows.forEach((row) => {
      filteredValueColumns.forEach((column) => {
        const status = (row as any)[column.statusColumn.id] as string | undefined;
        const stats = column.diffStats;
        switch (status) {
          case 'added':
            stats.added += 1;
            break;
          case 'removed':
            stats.removed += 1;
            break;
          case 'modified':
            stats.modified += 1;
            break;
          default:
            stats.same += 1;
        }
      });
    });

    return {
      joinColumns: filteredJoinColumns,
      valueColumns: filteredValueColumns,
      rowStatusColumn,
    };
  }, [
    compareColumns,
    config.joinColumns,
    results,
    filteredRows,
    visibleJoinColumns,
    visibleValueColumns,
  ]);

  useEffect(() => {
    if (!tableConfig) {
      return;
    }
    const allowedIds = new Set<string>();
    tableConfig.joinColumns.forEach(({ column }) => {
      allowedIds.add(String(column.id));
    });
    tableConfig.valueColumns.forEach((column) => {
      allowedIds.add(String(column.columnA.id));
      allowedIds.add(String(column.columnB.id));
    });
    setColumnFilters((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (!allowedIds.has(key)) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [tableConfig]);

  // Handle sort
  const handleSort = useCallback((columnId: string) => {
    setSort((prevSort) => {
      const existing = prevSort.find((s) => s.column === columnId);
      if (existing) {
        // Toggle between asc, desc, none
        if (existing.order === 'asc') {
          return [{ column: columnId, order: 'desc' }];
        }
        return [];
      }
      return [{ column: columnId, order: 'asc' }];
    });
  }, []);

  // Handle clicking on source A badge - opens the table/view in a new tab
  const handleSourceAClick = useCallback(() => {
    const { sourceA } = config;
    if (!sourceA || sourceA.type !== 'table') return;

    // Find the data source by database name
    const dataSource = Array.from(dataSources.values()).find(
      (ds) =>
        (ds.type === 'remote-db' || ds.type === 'attached-db') &&
        ds.dbName === sourceA.databaseName,
    );

    if (dataSource && (dataSource.type === 'remote-db' || dataSource.type === 'attached-db')) {
      // Look up the object type from database metadata
      const dbMetadata = databaseMetadata.get(dataSource.dbName);
      const schemaName = sourceA.schemaName || 'main';
      const schema = dbMetadata?.schemas.find((s) => s.name === schemaName);
      const dbObject = schema?.objects.find((obj) => obj.name === sourceA.tableName);
      const objectType = dbObject?.type || 'table';

      getOrCreateTabFromLocalDBObject(dataSource, schemaName, sourceA.tableName, objectType, true);
    }
  }, [config.sourceA, dataSources, databaseMetadata]);

  // Handle clicking on source B badge - opens the table/view in a new tab
  const handleSourceBClick = useCallback(() => {
    const { sourceB } = config;
    if (!sourceB || sourceB.type !== 'table') return;

    // Find the data source by database name
    const dataSource = Array.from(dataSources.values()).find(
      (ds) =>
        (ds.type === 'remote-db' || ds.type === 'attached-db') &&
        ds.dbName === sourceB.databaseName,
    );

    if (dataSource && (dataSource.type === 'remote-db' || dataSource.type === 'attached-db')) {
      // Look up the object type from database metadata
      const dbMetadata = databaseMetadata.get(dataSource.dbName);
      const schemaName = sourceB.schemaName || 'main';
      const schema = dbMetadata?.schemas.find((s) => s.name === schemaName);
      const dbObject = schema?.objects.find((obj) => obj.name === sourceB.tableName);
      const objectType = dbObject?.type || 'table';

      getOrCreateTabFromLocalDBObject(dataSource, schemaName, sourceB.tableName, objectType, true);
    }
  }, [config.sourceB, dataSources, databaseMetadata]);
  // Handle errors
  if (error && !handledMissingTableRef.current) {
    return (
      <Alert
        icon={<IconInfoCircle size={16} className={ICON_CLASSES.error} />}
        title="Error Loading Results"
        color="background-error"
        styles={getAlertStyles('error')}
      >
        {error}
      </Alert>
    );
  }

  if (error) {
    return null;
  }

  if (!results) {
    return (
      <div style={{ position: 'relative', minHeight: '200px' }}>
        <LoadingOverlay visible overlayProps={{ blur: 2 }} />
      </div>
    );
  }

  // Handle empty results
  if (statusTotals.total === 0) {
    return (
      <Stack gap="lg" style={{ position: 'relative' }}>
        <LoadingOverlay visible={isLoading} overlayProps={{ blur: 2 }} />
        <ComparisonToolbar
          onReconfigure={onReconfigure}
          onRefresh={onRefresh}
          onExport={() => {}}
          onCopy={async () => {}}
          isRefreshing={false}
          onClearResults={handleClearResults}
          isClearing={isClearing}
        />
        <Alert
          icon={<IconInfoCircle size={16} className={ICON_CLASSES.accent} />}
          title="No Results"
          color="background-accent"
          styles={getAlertStyles('accent')}
        >
          The comparison returned no results. This could mean:
          <ul style={{ marginTop: '8px', marginLeft: '20px' }}>
            <li>Both sources have no matching rows based on the join keys</li>
            <li>The filters excluded all rows</li>
            <li>One or both data sources are empty</li>
          </ul>
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="lg" style={{ position: 'relative' }}>
      <LoadingOverlay visible={isLoading} overlayProps={{ blur: 2 }} />
      {/* Toolbar */}
      <ComparisonToolbar
        onReconfigure={onReconfigure}
        onRefresh={onRefresh}
        onExport={() => {}}
        onCopy={async () => {}}
        isRefreshing={isLoading}
        onClearResults={handleClearResults}
        isClearing={isClearing}
      />

      <Paper p="md" withBorder>
        <Group align="flex-start" gap="xl">
          {/* Configuration Info */}
          <Stack gap="xs" style={{ flex: 1 }}>
            <Text size="sm" fw={600}>
              Configuration
            </Text>
            <Group gap="xs">
              <Text size="xs" c="dimmed">
                Source A:
              </Text>
              <Badge
                size="sm"
                variant="light"
                color="blue"
                style={{ cursor: 'pointer' }}
                onClick={handleSourceAClick}
              >
                {config.sourceA?.type === 'table'
                  ? config.sourceA.tableName
                  : config.sourceA?.type === 'query'
                    ? config.sourceA.alias
                    : 'Unknown'}
              </Badge>
            </Group>
            <Group gap="xs">
              <Text size="xs" c="dimmed">
                Source B:
              </Text>
              <Badge
                size="sm"
                variant="light"
                color="violet"
                style={{ cursor: 'pointer' }}
                onClick={handleSourceBClick}
              >
                {config.sourceB?.type === 'table'
                  ? config.sourceB.tableName
                  : config.sourceB?.type === 'query'
                    ? config.sourceB.alias
                    : 'Unknown'}
              </Badge>
            </Group>
            <Group gap="xs">
              <Text size="xs" c="dimmed">
                Join Keys:
              </Text>
              {config.joinColumns.map((key) => (
                <Badge
                  key={key}
                  size="sm"
                  variant="light"
                  style={{
                    backgroundColor: getStatusSurfaceColor(theme, 'added', colorScheme),
                    color: getStatusAccentColor(theme, 'added', colorScheme),
                  }}
                >
                  {key}
                </Badge>
              ))}
            </Group>
            <Text size="xs" c="dimmed">
              Comparing {compareColumns.length} columns
            </Text>
            <Text size="xs" c="dimmed">
              Last run: {lastRunAt ? new Date(lastRunAt).toLocaleString() : 'Unknown'} (
              {executionTime.toFixed(1)}s)
            </Text>
          </Stack>

          {/* Ring Progress Chart */}
          <RingProgress
            size={100}
            thickness={10}
            sections={ringProgressSections}
            label={
              <Text size="xs" ta="center" fw={700} component="div">
                {statusTotals.total}
                <br />
                <Text size="xs" c="dimmed" fw={400} component="span">
                  rows
                </Text>
              </Text>
            }
          />

          {/* Summary Stats */}
          <Stack gap="xs" style={{ flex: 1 }}>
            <Text size="sm" fw={600}>
              Comparison Summary
            </Text>
            <Group gap="md" wrap="wrap">
              <Group gap="xs">
                <IconPlus
                  size={14}
                  style={{ color: getStatusAccentColor(theme, 'added', colorScheme) }}
                />
                <Text size="sm" fw={600} c={COMPARISON_STATUS_THEME.added.textColor}>
                  {statusTotals.added} ADDED
                </Text>
                <Text size="xs" c="dimmed">
                  (
                  {statusTotals.total > 0
                    ? ((statusTotals.added / statusTotals.total) * 100).toFixed(1)
                    : 0}
                  %)
                </Text>
              </Group>

              <Group gap="xs">
                <IconMinus
                  size={14}
                  style={{ color: getStatusAccentColor(theme, 'removed', colorScheme) }}
                />
                <Text size="sm" fw={600} c={COMPARISON_STATUS_THEME.removed.textColor}>
                  {statusTotals.removed} REMOVED
                </Text>
                <Text size="xs" c="dimmed">
                  (
                  {statusTotals.total > 0
                    ? ((statusTotals.removed / statusTotals.total) * 100).toFixed(1)
                    : 0}
                  %)
                </Text>
              </Group>

              <Group gap="xs">
                <IconPencil
                  size={14}
                  style={{ color: getStatusAccentColor(theme, 'modified', colorScheme) }}
                />
                <Text size="sm" fw={600} c={COMPARISON_STATUS_THEME.modified.textColor}>
                  {statusTotals.modified} MODIFIED
                </Text>
                <Text size="xs" c="dimmed">
                  (
                  {statusTotals.total > 0
                    ? ((statusTotals.modified / statusTotals.total) * 100).toFixed(1)
                    : 0}
                  %)
                </Text>
              </Group>

              <Group gap="xs">
                <IconCheck
                  size={14}
                  style={{ color: getStatusAccentColor(theme, 'same', colorScheme) }}
                />
                <Text size="sm" fw={600} c={COMPARISON_STATUS_THEME.same.textColor}>
                  {statusTotals.same} UNCHANGED
                </Text>
                <Text size="xs" c="dimmed">
                  (
                  {statusTotals.total > 0
                    ? ((statusTotals.same / statusTotals.total) * 100).toFixed(1)
                    : 0}
                  %)
                </Text>
              </Group>
            </Group>
          </Stack>
        </Group>

        <Divider my="md" label="Show" labelPosition="left" />

        <Stack gap="xs">
          <Chip.Group>
            <Group gap="xs">
              <Chip
                checked={showAdded}
                onChange={() => setShowAdded(!showAdded)}
                variant="light"
                styles={{
                  label: {
                    backgroundColor: getStatusSurfaceColor(theme, 'added', colorScheme),
                    color: getStatusAccentColor(theme, 'added', colorScheme),
                  },
                }}
              >
                <Group gap={4}>
                  <IconPlus size={12} />
                  Added ({statusTotals.added})
                </Group>
              </Chip>
              <Chip
                checked={showRemoved}
                onChange={() => setShowRemoved(!showRemoved)}
                variant="light"
                styles={{
                  label: {
                    backgroundColor: getStatusSurfaceColor(theme, 'removed', colorScheme),
                    color: getStatusAccentColor(theme, 'removed', colorScheme),
                  },
                }}
              >
                <Group gap={4}>
                  <IconMinus size={12} />
                  Removed ({statusTotals.removed})
                </Group>
              </Chip>
              <Chip
                checked={showModified}
                onChange={() => setShowModified(!showModified)}
                variant="light"
                styles={{
                  label: {
                    backgroundColor: getStatusSurfaceColor(theme, 'modified', colorScheme),
                    color: getStatusAccentColor(theme, 'modified', colorScheme),
                  },
                }}
              >
                <Group gap={4}>
                  <IconPencil size={12} />
                  Modified ({statusTotals.modified})
                </Group>
              </Chip>
              <Chip
                checked={showUnchanged}
                onChange={() => setShowUnchanged(!showUnchanged)}
                variant="light"
                styles={{
                  label: {
                    backgroundColor: getStatusSurfaceColor(theme, 'same', colorScheme),
                    color: getStatusAccentColor(theme, 'same', colorScheme),
                  },
                }}
              >
                <Group gap={4}>
                  <IconCheck size={12} />
                  Unchanged ({statusTotals.same})
                </Group>
              </Chip>
            </Group>
          </Chip.Group>
          {(activeColumnFilters.length > 0 || hasStatusFilter) && (
            <Group gap="xs" wrap="wrap">
              {hasStatusFilter && (
                <Badge
                  variant="light"
                  color="accent"
                  rightSection={
                    <ActionIcon
                      variant="subtle"
                      color="accent"
                      size="xs"
                      onClick={() => {
                        setShowAdded(true);
                        setShowRemoved(true);
                        setShowModified(true);
                        setShowUnchanged(false);
                      }}
                    >
                      <IconX size={10} />
                    </ActionIcon>
                  }
                >
                  Status filters active
                </Badge>
              )}
              {activeColumnFilters.map(({ columnId, label, value }) => (
                <Badge
                  key={columnId}
                  variant="light"
                  color="accent"
                  rightSection={
                    <ActionIcon
                      variant="subtle"
                      color="accent"
                      size="xs"
                      onClick={() => handleColumnFilterChange(columnId, '')}
                    >
                      <IconX size={10} />
                    </ActionIcon>
                  }
                >
                  {label}: {value}
                </Badge>
              ))}
            </Group>
          )}
        </Stack>
      </Paper>

      {/* Schema Differences (if any) */}
      {(schemaComparison.onlyInA.length > 0 || schemaComparison.onlyInB.length > 0) && (
        <Alert
          icon={<IconInfoCircle size={16} className={ICON_CLASSES.accent} />}
          color="background-accent"
          variant="light"
          styles={getAlertStyles('accent')}
        >
          <Text size="sm" fw={500}>
            Schema Differences Detected
          </Text>
          {schemaComparison.onlyInA.length > 0 && (
            <Text size="xs" mt="xs">
              {schemaComparison.onlyInA.length} columns only in Source A:{' '}
              {schemaComparison.onlyInA.map((c) => c.name).join(', ')}
            </Text>
          )}
          {schemaComparison.onlyInB.length > 0 && (
            <Text size="xs" mt="xs">
              {schemaComparison.onlyInB.length} columns only in Source B:{' '}
              {schemaComparison.onlyInB.map((c) => c.name).join(', ')}
            </Text>
          )}
        </Alert>
      )}

      {/* Comparison Results Table */}
      <Paper p="md" withBorder>
        <Group justify="space-between" align="flex-start" mb="sm">
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              Comparison Results
            </Text>
            <Text size="xs" c="dimmed">
              Showing {displayedRows.length.toLocaleString()} of{' '}
              {statusTotals.total.toLocaleString()} rows
            </Text>
            {isTruncated && (
              <Text size="xs" c="dimmed">
                Showing the first {RESULTS_ROW_LIMIT.toLocaleString()} rows. Narrow filters to see
                more.
              </Text>
            )}
          </Stack>
          <Group gap="xs">
            {canResetFilters && (
              <Button variant="light" size="xs" onClick={handleResetFilters}>
                Reset Filters
              </Button>
            )}
            <Popover
              opened={columnsPopoverOpened}
              onChange={setColumnsPopoverOpened}
              withArrow
              shadow="md"
              trapFocus
              position="bottom-end"
            >
              <Popover.Target>
                <Button
                  variant="light"
                  size="xs"
                  leftSection={<IconLayoutColumns size={14} />}
                  onClick={() => setColumnsPopoverOpened((open) => !open)}
                >
                  Select Columns
                </Button>
              </Popover.Target>
              <Popover.Dropdown maw={320} p="sm">
                <Stack gap="xs">
                  <TextInput
                    size="xs"
                    placeholder="Search columns..."
                    value={columnSearchQuery}
                    onChange={(event) => setColumnSearchQuery(event.currentTarget.value)}
                  />
                  <Group gap="xs">
                    <Button size="xs" variant="subtle" onClick={() => handleSelectAllColumns(true)}>
                      Select All
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => handleSelectAllColumns(false)}
                    >
                      Deselect All
                    </Button>
                  </Group>
                  <Text size="xs" fw={600} c="dimmed">
                    Join Columns
                  </Text>
                  <ScrollArea.Autosize mah={120} type="auto">
                    <Stack gap={4}>
                      {filteredJoinColumnOptions.length === 0 ? (
                        <Text size="xs" c="dimmed">
                          No columns
                        </Text>
                      ) : (
                        filteredJoinColumnOptions.map((option) => (
                          <Checkbox
                            key={option.id}
                            size="xs"
                            label={option.label}
                            checked={visibleJoinColumns[option.id] !== false}
                            onChange={(event) =>
                              handleJoinColumnVisibilityChange(
                                option.id,
                                event.currentTarget.checked,
                              )
                            }
                          />
                        ))
                      )}
                    </Stack>
                  </ScrollArea.Autosize>
                  <Text size="xs" fw={600} c="dimmed">
                    Comparison Columns
                  </Text>
                  <ScrollArea.Autosize mah={150} type="auto">
                    <Stack gap={4}>
                      {filteredValueColumnOptions.length === 0 ? (
                        <Text size="xs" c="dimmed">
                          No columns
                        </Text>
                      ) : (
                        filteredValueColumnOptions.map((option) => (
                          <Checkbox
                            key={option.id}
                            size="xs"
                            label={option.label}
                            checked={visibleValueColumns[option.id] !== false}
                            onChange={(event) =>
                              handleValueColumnVisibilityChange(
                                option.id,
                                event.currentTarget.checked,
                              )
                            }
                          />
                        ))
                      )}
                    </Stack>
                  </ScrollArea.Autosize>
                </Stack>
              </Popover.Dropdown>
            </Popover>
          </Group>
        </Group>
        {tableConfig ? (
          <ComparisonResultsTable
            rows={displayedRows}
            joinColumns={tableConfig.joinColumns}
            valueColumns={tableConfig.valueColumns}
            rowStatusColumn={tableConfig.rowStatusColumn}
            sort={sort}
            onSort={handleSort}
            columnFilters={columnFilters}
            onFilterChange={handleColumnFilterChange}
            scrollOffset={tableScrollOffset}
            onScrollChange={handleTableScrollChange}
          />
        ) : null}
      </Paper>
    </Stack>
  );
};
