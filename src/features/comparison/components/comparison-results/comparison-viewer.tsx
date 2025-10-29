import { Table } from '@components/table/table';
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
  useMantineTheme,
} from '@mantine/core';
import { ComparisonConfig, SchemaComparisonResult, TabId } from '@models/tab';
import { IconInfoCircle, IconPlus, IconMinus, IconPencil, IconCheck } from '@tabler/icons-react';
import { useState, useMemo, useCallback } from 'react';

import { ComparisonToolbar } from '../comparison-toolbar';
import { ICON_CLASSES } from '../../constants/color-classes';
import { useComparisonResultsSimple } from '../../hooks/use-comparison-results-simple';
import { getColumnsToCompare } from '../../utils/sql-generator';
import {
  COMPARISON_STATUS_THEME,
  getStatusAccentColor,
  getStatusSurfaceColor,
  getThemeColorValue,
} from '../../utils/theme';

interface ComparisonViewerProps {
  tabId: TabId;
  config: ComparisonConfig;
  schemaComparison: SchemaComparisonResult;
  tableName: string;
  executionTime: number;
  onReconfigure: () => void;
  onRefresh: () => void;
}

export const ComparisonViewer = ({
  tabId,
  config,
  schemaComparison,
  tableName,
  executionTime,
  onReconfigure,
  onRefresh,
}: ComparisonViewerProps) => {
  const theme = useMantineTheme();
  const colorScheme = useAppTheme();
  const baseAlertText = getThemeColorValue(theme, 'text-primary', colorScheme === 'dark' ? 0 : 9);
  const accentAlertTitle = getThemeColorValue(theme, 'text-accent', colorScheme === 'dark' ? 2 : 6);

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
  const [sort, setSort] = useState<any[]>([]);

  // Fetch results with sorting
  const { results, isLoading, error } = useComparisonResultsSimple(
    tableName,
    config,
    schemaComparison,
    executionTime,
    sort,
  );

  // Filter state - default to showing only differences
  const [showAdded, setShowAdded] = useState(true);
  const [showRemoved, setShowRemoved] = useState(true);
  const [showModified, setShowModified] = useState(true);
  const [showUnchanged, setShowUnchanged] = useState(false);

  // Get the columns being compared
  const compareColumns = useMemo(
    () => getColumnsToCompare(config, schemaComparison),
    [config, schemaComparison],
  );

  // Filter rows based on status toggles
  const filteredRows = useMemo(() => {
    if (!results) return [];

    return results.rows.filter((row) => {
      const status = (row as any)._row_status as string;
      if (status === 'added' && !showAdded) return false;
      if (status === 'removed' && !showRemoved) return false;
      if (status === 'modified' && !showModified) return false;
      if (status === 'same' && !showUnchanged) return false;
      return true;
    });
  }, [results, showAdded, showRemoved, showModified, showUnchanged]);

  // Calculate stats
  const stats = results?.stats || {
    total: 0,
    added: 0,
    removed: 0,
    modified: 0,
    same: 0,
  };

  // Calculate ring progress sections
  const ringProgressSections = useMemo(() => {
    const sections: { value: number; color: string }[] = [];
    if (stats.added > 0) {
      sections.push({
        value: (stats.added / stats.total) * 100,
        color: COMPARISON_STATUS_THEME.added.accentColorKey,
      });
    }
    if (stats.removed > 0) {
      sections.push({
        value: (stats.removed / stats.total) * 100,
        color: COMPARISON_STATUS_THEME.removed.accentColorKey,
      });
    }
    if (stats.modified > 0) {
      sections.push({
        value: (stats.modified / stats.total) * 100,
        color: COMPARISON_STATUS_THEME.modified.accentColorKey,
      });
    }
    if (stats.same > 0) {
      sections.push({
        value: (stats.same / stats.total) * 100,
        color: COMPARISON_STATUS_THEME.same.accentColorKey,
      });
    }
    return sections;
  }, [stats]);

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

  // Prepare data slice for Table component
  const dataSlice = useMemo(() => {
    return {
      data: filteredRows,
      rowOffset: 0,
    };
  }, [filteredRows]);

  // Handle errors
  if (error) {
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

  if (isLoading || !results) {
    return (
      <div style={{ position: 'relative', minHeight: '200px' }}>
        <LoadingOverlay visible overlayProps={{ blur: 2 }} />
      </div>
    );
  }

  // Handle empty results
  if (stats.total === 0) {
    return (
      <Stack gap="lg">
        <ComparisonToolbar
          onReconfigure={onReconfigure}
          onRefresh={onRefresh}
          onExport={() => {}}
          onCopy={async () => {}}
          isRefreshing={false}
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
    <Stack gap="lg">
      {/* Toolbar */}
      <ComparisonToolbar
        onReconfigure={onReconfigure}
        onRefresh={onRefresh}
        onExport={() => {}}
        onCopy={async () => {}}
        isRefreshing={isLoading}
      />

      {/* Compact Header - Configuration + Chart + Summary */}
      <Paper p="md" withBorder>
        <Group align="flex-start" gap="xl">
          {/* Configuration Info */}
          <Stack gap="xs" style={{ flex: 1 }}>
            <Text size="sm" fw={600}>
              Configuration
            </Text>
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
          </Stack>

          {/* Ring Progress Chart */}
          <RingProgress
            size={100}
            thickness={10}
            sections={ringProgressSections}
            label={
              <Text size="xs" ta="center" fw={700} component="div">
                {stats.total}
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
                  {stats.added} ADDED
                </Text>
                <Text size="xs" c="dimmed">
                  ({stats.total > 0 ? ((stats.added / stats.total) * 100).toFixed(1) : 0}%)
                </Text>
              </Group>

              <Group gap="xs">
                <IconMinus
                  size={14}
                  style={{ color: getStatusAccentColor(theme, 'removed', colorScheme) }}
                />
                <Text size="sm" fw={600} c={COMPARISON_STATUS_THEME.removed.textColor}>
                  {stats.removed} REMOVED
                </Text>
                <Text size="xs" c="dimmed">
                  ({stats.total > 0 ? ((stats.removed / stats.total) * 100).toFixed(1) : 0}%)
                </Text>
              </Group>

              <Group gap="xs">
                <IconPencil
                  size={14}
                  style={{ color: getStatusAccentColor(theme, 'modified', colorScheme) }}
                />
                <Text size="sm" fw={600} c={COMPARISON_STATUS_THEME.modified.textColor}>
                  {stats.modified} MODIFIED
                </Text>
                <Text size="xs" c="dimmed">
                  ({stats.total > 0 ? ((stats.modified / stats.total) * 100).toFixed(1) : 0}%)
                </Text>
              </Group>

              <Group gap="xs">
                <IconCheck
                  size={14}
                  style={{ color: getStatusAccentColor(theme, 'same', colorScheme) }}
                />
                <Text size="sm" fw={600} c={COMPARISON_STATUS_THEME.same.textColor}>
                  {stats.same} UNCHANGED
                </Text>
                <Text size="xs" c="dimmed">
                  ({stats.total > 0 ? ((stats.same / stats.total) * 100).toFixed(1) : 0}%)
                </Text>
              </Group>
            </Group>
          </Stack>
        </Group>
      </Paper>

      {/* Filter Toggles */}
      <Paper p="md" withBorder>
        <Group gap="md">
          <Text size="sm" fw={600}>
            Show:
          </Text>
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
                  Added ({stats.added})
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
                  Removed ({stats.removed})
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
                  Modified ({stats.modified})
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
                  Unchanged ({stats.same})
                </Group>
              </Chip>
            </Group>
          </Chip.Group>
        </Group>
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
        <Text size="sm" fw={600} mb="md">
          Comparison Results ({filteredRows.length} of {stats.total} rows)
        </Text>
        <Table
          dataSlice={dataSlice}
          schema={results.schema}
          sort={sort}
          visible={true}
          onSort={handleSort}
          onRowSelectChange={() => {}}
          onCellSelectChange={() => {}}
          onColumnSelectChange={() => {}}
        />
      </Paper>
    </Stack>
  );
};
