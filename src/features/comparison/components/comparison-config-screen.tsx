import { updateSchemaComparison } from '@controllers/tab/comparison-tab-controller';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { useAppTheme } from '@hooks/use-app-theme';
import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Group,
  Loader,
  MultiSelect,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  useMantineTheme,
} from '@mantine/core';
import { ComparisonConfig, ComparisonSource, SchemaComparisonResult, TabId } from '@models/tab';
import { IconAlertCircle, IconCheck, IconChevronDown, IconTable, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, RefObject, useMemo } from 'react';

import { ICON_CLASSES } from '../constants/color-classes';
import { useComparisonSourceSelection } from '../hooks/use-comparison-source-selection';
import { useFilterValidation } from '../hooks/use-filter-validation';
import {
  ComparisonRowStatus,
  getStatusAccentColor,
  getStatusSurfaceColor,
  getThemeColorValue,
} from '../utils/theme';

import { ColumnMapper } from './column-mapper';

// Constants
const SCROLL_COLLAPSE_THRESHOLD = 100;

interface ComparisonConfigScreenProps {
  tabId: TabId;
  config: ComparisonConfig | null;
  schemaComparison: SchemaComparisonResult | null;
  onConfigChange: (config: Partial<ComparisonConfig>) => void;
  onAnalyzeSchemas: (
    sourceA: ComparisonSource,
    sourceB: ComparisonSource,
  ) => Promise<SchemaComparisonResult | null>;
  isAnalyzing: boolean;
  onRun: () => void;
  canRun: boolean;
  isRunning: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

export const ComparisonConfigScreen = ({
  tabId,
  config,
  schemaComparison,
  onConfigChange,
  onAnalyzeSchemas,
  isAnalyzing,
  onRun,
  canRun,
  isRunning,
  scrollContainerRef,
}: ComparisonConfigScreenProps) => {
  const theme = useMantineTheme();
  const colorScheme = useAppTheme();
  const baseTextColor = getThemeColorValue(theme, 'text-primary', colorScheme === 'dark' ? 0 : 9);
  const accentTitleColor = getThemeColorValue(theme, 'text-accent', colorScheme === 'dark' ? 2 : 6);

  const getAlertStyles = (tone: 'error' | 'warning' | 'accent') => {
    const titleColorMap = {
      error: getStatusAccentColor(theme, 'removed', colorScheme),
      warning: getStatusAccentColor(theme, 'modified', colorScheme),
      accent: accentTitleColor,
    } as const;

    return {
      title: {
        color: titleColorMap[tone],
        fontWeight: 600,
      },
      message: {
        color: baseTextColor,
      },
    };
  };
  // Local UI state
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showOnlyInA, setShowOnlyInA] = useState(true);
  const [showOnlyInB, setShowOnlyInB] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Track if we've triggered analysis for the current sources
  const analysisTriggeredRef = useRef<string | null>(null);

  // Get DuckDB pool for filter validation
  const pool = useInitializedDuckDBConnectionPool();

  const commonFilterContexts = useMemo(() => {
    if (!config || config.filterMode !== 'common') {
      return [];
    }

    const contexts = [];
    if (config.sourceA) {
      contexts.push({ source: config.sourceA, label: 'Source A' });
    }
    if (config.sourceB) {
      contexts.push({ source: config.sourceB, label: 'Source B' });
    }
    return contexts;
  }, [config?.filterMode, config?.sourceA, config?.sourceB]);

  const filterAContexts = useMemo(() => {
    if (!config || config.filterMode !== 'separate' || !config.sourceA) {
      return [];
    }
    return [{ source: config.sourceA, label: 'Source A' }];
  }, [config?.filterMode, config?.sourceA]);

  const filterBContexts = useMemo(() => {
    if (!config || config.filterMode !== 'separate' || !config.sourceB) {
      return [];
    }
    return [{ source: config.sourceB, label: 'Source B' }];
  }, [config?.filterMode, config?.sourceB]);

  // Validate filters
  const commonFilterValidation = useFilterValidation(
    pool,
    config?.commonFilter || '',
    commonFilterContexts,
  );
  const filterAValidation = useFilterValidation(pool, config?.filterA || '', filterAContexts);
  const filterBValidation = useFilterValidation(pool, config?.filterB || '', filterBContexts);

  // Detect scroll to auto-collapse header
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const { scrollTop } = container;
          setIsCollapsed(scrollTop > SCROLL_COLLAPSE_THRESHOLD);
          ticking = false;
        });
        ticking = true;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => container.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef]);

  // Source selection hook
  const { selectSourceA, selectSourceB } = useComparisonSourceSelection(
    useCallback(
      (source: ComparisonSource | null) => {
        if (source) {
          onConfigChange({ sourceA: source });
          // Clear analysis results and flag when sources change
          analysisTriggeredRef.current = null;
          updateSchemaComparison(tabId, null);
        }
      },
      [onConfigChange, tabId],
    ),
    useCallback(
      (source: ComparisonSource | null) => {
        if (source) {
          onConfigChange({ sourceB: source });
          // Clear analysis results and flag when sources change
          analysisTriggeredRef.current = null;
          updateSchemaComparison(tabId, null);
        }
      },
      [onConfigChange, tabId],
    ),
  );

  // Helper to format source display name
  const getSourceDisplayName = (source: ComparisonSource | null): string => {
    if (!source) return 'Not selected';
    if (source.type === 'table') {
      const parts = [source.databaseName, source.schemaName, source.tableName].filter(Boolean);
      return parts.join('.');
    }
    return source.alias;
  };

  // Auto-trigger schema analysis when both sources are selected
  useEffect(() => {
    if (!config?.sourceA || !config?.sourceB) {
      // Clear analysis flag if sources are incomplete
      analysisTriggeredRef.current = null;
      return;
    }

    // Create a stable unique key for these sources to prevent duplicate analysis
    const createSourceKey = (sourceA: ComparisonSource, sourceB: ComparisonSource): string => {
      const keyA =
        sourceA.type === 'table'
          ? `table:${sourceA.databaseName}:${sourceA.schemaName}:${sourceA.tableName}`
          : `query:${sourceA.alias}`;
      const keyB =
        sourceB.type === 'table'
          ? `table:${sourceB.databaseName}:${sourceB.schemaName}:${sourceB.tableName}`
          : `query:${sourceB.alias}`;
      return `${keyA}|${keyB}`;
    };

    const sourceKey = createSourceKey(config.sourceA, config.sourceB);

    // Skip if we've already triggered analysis for these exact sources
    if (analysisTriggeredRef.current === sourceKey) {
      return;
    }

    // Skip if we already have results for these sources
    if (schemaComparison) {
      analysisTriggeredRef.current = sourceKey;
      return;
    }

    // Trigger analysis and mark as triggered
    analysisTriggeredRef.current = sourceKey;

    // Use a cancellation flag to prevent race conditions
    let cancelled = false;

    onAnalyzeSchemas(config.sourceA, config.sourceB).then((result) => {
      // Only update if this analysis is still relevant (sources haven't changed)
      if (!cancelled && result && analysisTriggeredRef.current === sourceKey) {
        updateSchemaComparison(tabId, result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [config?.sourceA, config?.sourceB, onAnalyzeSchemas, tabId]);

  // Handle join key toggle
  const handleJoinKeyToggle = (columnName: string) => {
    if (!config) return;
    const currentKeys = config.joinColumns || [];
    const newKeys = currentKeys.includes(columnName)
      ? currentKeys.filter((k) => k !== columnName)
      : [...currentKeys, columnName];
    onConfigChange({ joinColumns: newKeys });
  };

  // Handle filter mode change
  const handleFilterModeChange = (mode: 'common' | 'separate') => {
    onConfigChange({ filterMode: mode });
  };

  // Get column options for MultiSelect
  const getColumnOptions = (): { value: string; label: string }[] => {
    if (!schemaComparison) return [];
    return schemaComparison.commonColumns.map((col) => ({
      value: col.name,
      label: col.name,
    }));
  };

  // Check if configuration is valid
  const hasValidConfig = config?.sourceA && config?.sourceB;
  const hasSchemaAnalysis = !!schemaComparison;
  const hasJoinKeys = (config?.joinColumns || []).length > 0;
  const hasTypeMismatches = schemaComparison?.commonColumns.some((col) => !col.typesMatch) || false;
  const hasNoCommonColumns = schemaComparison?.commonColumns.length === 0;

  return (
    <div>
      {/* Input Section - Source Selection */}
      <Paper
        p={isCollapsed ? 'xs' : 'md'}
        withBorder
        bg="background-primary"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          transition: 'all 200ms ease-in-out',
          // Extend full width when collapsed
          ...(isCollapsed
            ? {
                borderRadius: 0,
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                paddingLeft: '1.5rem',
                paddingRight: '1.5rem',
              }
            : {
                margin: '1.5rem',
              }),
        }}
      >
        {isCollapsed ? (
          // Collapsed state - single compact row
          <Group justify="space-between" align="center" gap="md" wrap="nowrap">
            <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500} style={{ whiteSpace: 'nowrap' }}>
                {getSourceDisplayName(config?.sourceA || null)}
              </Text>
              <Text size="sm" c="dimmed">
                ⟷
              </Text>
              <Text size="sm" fw={500} style={{ whiteSpace: 'nowrap' }}>
                {getSourceDisplayName(config?.sourceB || null)}
              </Text>
            </Group>
            <Button onClick={onRun} disabled={!canRun || isRunning} loading={isRunning} size="xs">
              Run Comparison
            </Button>
          </Group>
        ) : (
          // Expanded state - full UI
          <>
            <Group justify="space-between" mb="md">
              <Text size="sm" fw={600}>
                Data Sources
              </Text>
              <Button onClick={onRun} disabled={!canRun || isRunning} loading={isRunning} size="sm">
                Run Comparison
              </Button>
            </Group>
            <Group grow>
              {/* Source A */}
              <Stack gap="xs">
                <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                  Source A
                </Text>
                <Button
                  variant={config?.sourceA ? 'light' : 'default'}
                  leftSection={<IconTable size={16} />}
                  onClick={selectSourceA}
                  fullWidth
                >
                  {getSourceDisplayName(config?.sourceA || null)}
                </Button>
              </Stack>

              {/* Source B */}
              <Stack gap="xs">
                <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                  Source B
                </Text>
                <Button
                  variant={config?.sourceB ? 'light' : 'default'}
                  leftSection={<IconTable size={16} />}
                  onClick={selectSourceB}
                  fullWidth
                >
                  {getSourceDisplayName(config?.sourceB || null)}
                </Button>
              </Stack>
            </Group>
          </>
        )}
      </Paper>

      {/* Main content with padding */}
      <Stack gap="lg" p="md">
        {/* Schema Analysis Section */}
        {isAnalyzing && (
          <Paper p="md" withBorder>
            <Group gap="sm">
              <Loader size="sm" />
              <Text size="sm">Analyzing schemas...</Text>
            </Group>
          </Paper>
        )}

        {hasValidConfig && hasSchemaAnalysis && (
          <>
            {/* Error: No common columns */}
            {hasNoCommonColumns && (
              <Alert
                icon={<IconAlertCircle size={16} className={ICON_CLASSES.error} />}
                title="No Common Columns"
                color="background-error"
                styles={getAlertStyles('error')}
              >
                The two data sources have no columns with matching names. Comparison requires at
                least one common column to use as a join key. Please select different sources or
                ensure the sources have matching column names.
              </Alert>
            )}

            {!hasNoCommonColumns && (
              <>
                {/* Combined Schema Analysis & Common Columns */}
                <Paper p="md" withBorder>
                  <Group justify="space-between" align="center" mb="md">
                    <Text size="sm" fw={600}>
                      Common Columns ({schemaComparison.commonColumns.length})
                    </Text>
                    <IconCheck size={16} className={ICON_CLASSES.success} />
                  </Group>

                  {(schemaComparison.onlyInA.length > 0 || schemaComparison.onlyInB.length > 0) && (
                    <Group gap="md" mb="md">
                      {schemaComparison.onlyInA.length > 0 && (
                        <Group gap="xs">
                          <IconAlertCircle size={16} className={ICON_CLASSES.accent} />
                          <Text size="sm" c="text-accent">
                            {schemaComparison.onlyInA.length} only in A
                          </Text>
                        </Group>
                      )}

                      {schemaComparison.onlyInB.length > 0 && (
                        <Group gap="xs">
                          <IconAlertCircle size={16} className={ICON_CLASSES.accent} />
                          <Text size="sm" c="text-accent">
                            {schemaComparison.onlyInB.length} only in B
                          </Text>
                        </Group>
                      )}
                    </Group>
                  )}

                  {/* Common Columns Detail */}
                  <Box>
                    {/* Column headers */}
                    <Group gap="md" wrap="nowrap" mb="xs">
                      <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ flex: 1 }}>
                        Column Name
                      </Text>
                      <Text
                        size="xs"
                        c="dimmed"
                        fw={600}
                        tt="uppercase"
                        style={{ width: 120, textAlign: 'center' }}
                      >
                        A
                      </Text>
                      <Box style={{ width: 144, textAlign: 'center' }}>
                        <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                          B
                        </Text>
                      </Box>
                    </Group>

                    <Stack gap="sm">
                      {schemaComparison.commonColumns.map((col) => {
                        const badgeStatus: ComparisonRowStatus = col.typesMatch
                          ? 'added'
                          : 'modified';
                        const badgeStyles = {
                          backgroundColor: getStatusSurfaceColor(theme, badgeStatus, colorScheme),
                          color: getStatusAccentColor(theme, badgeStatus, colorScheme),
                        } as const;

                        return (
                          <Group key={col.name} gap="md" wrap="nowrap">
                            <Text size="sm" fw={500} style={{ flex: 1 }}>
                              {col.name}
                            </Text>
                            <Badge size="sm" variant="light" style={{ width: 120, ...badgeStyles }}>
                              {col.typeA}
                            </Badge>
                            <Group gap="xs" wrap="nowrap" style={{ width: 144 }}>
                              <Badge
                                size="sm"
                                variant="light"
                                style={{ width: 120, ...badgeStyles }}
                              >
                                {col.typeB}
                              </Badge>
                              {!col.typesMatch && (
                                <IconAlertCircle
                                  size={14}
                                  className={ICON_CLASSES.warning}
                                  title="Type mismatch"
                                />
                              )}
                            </Group>
                          </Group>
                        );
                      })}
                    </Stack>
                  </Box>

                  {hasTypeMismatches && (
                    <Alert
                      icon={<IconAlertCircle size={16} className={ICON_CLASSES.warning} />}
                      color="background-warning"
                      variant="light"
                      p="xs"
                      mt="md"
                      styles={getAlertStyles('warning')}
                    >
                      <Text size="sm">
                        {schemaComparison.commonColumns.filter((col) => !col.typesMatch).length}{' '}
                        type mismatches detected. Consider enabling &apos;Coerce&apos; mode in
                        advanced options to automatically convert types during comparison.
                      </Text>
                    </Alert>
                  )}
                </Paper>

                {/* Columns only in A */}
                {schemaComparison.onlyInA.length > 0 && (
                  <Paper p="md" withBorder>
                    <Group justify="space-between" mb="md">
                      <Text size="sm" fw={600}>
                        Only in Source A ({schemaComparison.onlyInA.length})
                      </Text>
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => setShowOnlyInA(!showOnlyInA)}
                        rightSection={
                          <IconChevronDown
                            size={14}
                            style={{
                              transform: showOnlyInA ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 200ms',
                            }}
                          />
                        }
                      >
                        {showOnlyInA ? 'Hide' : 'Show'}
                      </Button>
                    </Group>
                    <Collapse in={showOnlyInA}>
                      <Stack gap="xs">
                        {schemaComparison.onlyInA.map((col) => (
                          <Group key={col.name} justify="space-between">
                            <Text size="sm" fw={500}>
                              {col.name}
                            </Text>
                            <Badge
                              size="sm"
                              variant="filled"
                              color="background-accent"
                              className="text-textContrast-light dark:text-textContrast-dark"
                            >
                              {col.type}
                            </Badge>
                          </Group>
                        ))}
                      </Stack>
                    </Collapse>
                  </Paper>
                )}

                {/* Columns only in B */}
                {schemaComparison.onlyInB.length > 0 && (
                  <Paper p="md" withBorder>
                    <Group justify="space-between" mb="md">
                      <Text size="sm" fw={600}>
                        Only in Source B ({schemaComparison.onlyInB.length})
                      </Text>
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => setShowOnlyInB(!showOnlyInB)}
                        rightSection={
                          <IconChevronDown
                            size={14}
                            style={{
                              transform: showOnlyInB ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 200ms',
                            }}
                          />
                        }
                      >
                        {showOnlyInB ? 'Hide' : 'Show'}
                      </Button>
                    </Group>
                    <Collapse in={showOnlyInB}>
                      <Stack gap="xs">
                        {schemaComparison.onlyInB.map((col) => (
                          <Group key={col.name} justify="space-between">
                            <Text size="sm" fw={500}>
                              {col.name}
                            </Text>
                            <Badge
                              size="sm"
                              variant="filled"
                              color="background-accent"
                              className="text-textContrast-light dark:text-textContrast-dark"
                            >
                              {col.type}
                            </Badge>
                          </Group>
                        ))}
                      </Stack>
                    </Collapse>
                  </Paper>
                )}

                {/* Join Criteria Section */}
                <Paper p="md" withBorder>
                  <Text size="sm" fw={600} mb="xs">
                    Join Keys
                  </Text>
                  <Text size="xs" c="dimmed" mb="md">
                    Select columns that uniquely identify matching rows in both sources
                  </Text>

                  {schemaComparison.suggestedKeys.length > 0 && (
                    <Box mb="sm">
                      <Text size="xs" c="dimmed" mb="xs">
                        Suggested keys (click to toggle):
                      </Text>
                      <Chip.Group multiple value={config?.joinColumns || []}>
                        <Group gap="xs">
                          {schemaComparison.suggestedKeys.map((key) => {
                            const isSelected = !!config?.joinColumns?.includes(key);
                            const chipLabelStyles = isSelected
                              ? {
                                  backgroundColor: getStatusSurfaceColor(
                                    theme,
                                    'added',
                                    colorScheme,
                                  ),
                                  color: getStatusAccentColor(theme, 'added', colorScheme),
                                }
                              : undefined;
                            const chipStyles = chipLabelStyles
                              ? { label: chipLabelStyles }
                              : undefined;

                            return (
                              <Chip
                                key={key}
                                value={key}
                                onChange={() => handleJoinKeyToggle(key)}
                                variant="light"
                                styles={chipStyles}
                                icon={
                                  isSelected ? (
                                    <IconCheck size={12} className={ICON_CLASSES.success} />
                                  ) : (
                                    <IconX size={12} />
                                  )
                                }
                              >
                                {key}
                              </Chip>
                            );
                          })}
                        </Group>
                      </Chip.Group>
                    </Box>
                  )}

                  {!hasJoinKeys && (
                    <Alert
                      icon={<IconAlertCircle size={16} className={ICON_CLASSES.warning} />}
                      color="background-warning"
                      variant="light"
                      p="xs"
                      styles={getAlertStyles('warning')}
                    >
                      <Text size="sm">
                        No join keys selected. Please select at least one column to use as a join
                        key.
                      </Text>
                    </Alert>
                  )}

                  {hasJoinKeys && (
                    <Box mt="sm">
                      <Text size="xs" fw={500} mb="xs">
                        Selected keys:
                      </Text>
                      <Chip.Group multiple value={config?.joinColumns || []}>
                        <Group gap="xs">
                          {config?.joinColumns?.map((key) => {
                            const activeStyles = {
                              backgroundColor: getStatusSurfaceColor(theme, 'added', colorScheme),
                              color: getStatusAccentColor(theme, 'added', colorScheme),
                            };
                            return (
                              <Chip
                                key={key}
                                value={key}
                                onChange={() => handleJoinKeyToggle(key)}
                                variant="light"
                                styles={{ label: activeStyles }}
                              >
                                {key}
                              </Chip>
                            );
                          })}
                        </Group>
                      </Chip.Group>
                    </Box>
                  )}
                </Paper>

                {/* Column Mapping Section */}
                <ColumnMapper
                  schemaComparison={schemaComparison}
                  columnMappings={config?.columnMappings || {}}
                  onMappingsChange={(mappings) => onConfigChange({ columnMappings: mappings })}
                />

                {/* Filter Section */}
                <Paper p="md" withBorder>
                  <Text size="sm" fw={600} mb="md">
                    Filters
                  </Text>

                  <SegmentedControl
                    value={config?.filterMode || 'common'}
                    onChange={(value) => handleFilterModeChange(value as 'common' | 'separate')}
                    data={[
                      { label: 'Common filter', value: 'common' },
                      { label: 'Separate filters', value: 'separate' },
                    ]}
                    mb="md"
                    fullWidth
                  />

                  {config?.filterMode === 'common' ? (
                    <Box>
                      <Textarea
                        label="Common Filter (WHERE clause)"
                        placeholder="e.g., status = 'active' AND created_at > '2024-01-01'"
                        value={config?.commonFilter || ''}
                        onChange={(e) => onConfigChange({ commonFilter: e.currentTarget.value })}
                        minRows={2}
                        autosize
                        description="Applied to both sources before comparison"
                        error={commonFilterValidation.state === 'invalid' ? true : undefined}
                        rightSection={
                          commonFilterValidation.state === 'validating' ? (
                            <Loader size="xs" />
                          ) : commonFilterValidation.state === 'valid' ? (
                            <IconCheck size={16} className={ICON_CLASSES.success} />
                          ) : undefined
                        }
                      />
                      {commonFilterValidation.state === 'invalid' &&
                        commonFilterValidation.error && (
                          <Text size="xs" c="text-error" mt={4}>
                            {commonFilterValidation.error}
                          </Text>
                        )}
                    </Box>
                  ) : (
                    <Group grow align="flex-start">
                      <Box>
                        <Textarea
                          label="Filter A (WHERE clause)"
                          placeholder="e.g., status = 'active'"
                          value={config?.filterA || ''}
                          onChange={(e) => onConfigChange({ filterA: e.currentTarget.value })}
                          minRows={2}
                          autosize
                          error={filterAValidation.state === 'invalid' ? true : undefined}
                          rightSection={
                            filterAValidation.state === 'validating' ? (
                              <Loader size="xs" />
                            ) : filterAValidation.state === 'valid' ? (
                              <IconCheck size={16} className={ICON_CLASSES.success} />
                            ) : undefined
                          }
                        />
                        {filterAValidation.state === 'invalid' && filterAValidation.error && (
                          <Text size="xs" c="text-error" mt={4}>
                            {filterAValidation.error}
                          </Text>
                        )}
                      </Box>
                      <Box>
                        <Textarea
                          label="Filter B (WHERE clause)"
                          placeholder="e.g., status = 'active'"
                          value={config?.filterB || ''}
                          onChange={(e) => onConfigChange({ filterB: e.currentTarget.value })}
                          minRows={2}
                          autosize
                          error={filterBValidation.state === 'invalid' ? true : undefined}
                          rightSection={
                            filterBValidation.state === 'validating' ? (
                              <Loader size="xs" />
                            ) : filterBValidation.state === 'valid' ? (
                              <IconCheck size={16} className={ICON_CLASSES.success} />
                            ) : undefined
                          }
                        />
                        {filterBValidation.state === 'invalid' && filterBValidation.error && (
                          <Text size="xs" c="text-error" mt={4}>
                            {filterBValidation.error}
                          </Text>
                        )}
                      </Box>
                    </Group>
                  )}
                </Paper>

                {/* Advanced Options */}
                <Paper p="md" withBorder>
                  <Button
                    variant="subtle"
                    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                    rightSection={
                      <IconChevronDown
                        size={16}
                        style={{
                          transform: showAdvancedOptions ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 200ms',
                        }}
                      />
                    }
                    mb={showAdvancedOptions ? 'md' : 0}
                  >
                    Advanced Options
                  </Button>

                  <Collapse in={showAdvancedOptions}>
                    <Stack gap="md">
                      <Checkbox
                        label="Show only rows with differences"
                        description="Filter out rows that are identical in both sources (recommended for large datasets)"
                        checked={config?.showOnlyDifferences ?? true}
                        onChange={(e) =>
                          onConfigChange({ showOnlyDifferences: e.currentTarget.checked })
                        }
                      />

                      <MultiSelect
                        label="Compare specific columns"
                        description="Leave empty to compare all common columns"
                        placeholder="Select columns to compare"
                        data={getColumnOptions()}
                        value={config?.compareColumns || []}
                        onChange={(value) =>
                          onConfigChange({ compareColumns: value.length > 0 ? value : null })
                        }
                        searchable
                        clearable
                      />

                      <Select
                        label="Compare mode"
                        description="Strict: exact type matching. Coerce: automatic type conversion for mismatched types"
                        data={[
                          { value: 'strict', label: 'Strict (exact types)' },
                          { value: 'coerce', label: 'Coerce (convert types)' },
                        ]}
                        value={config?.compareMode || 'strict'}
                        onChange={(value) =>
                          onConfigChange({ compareMode: value as 'strict' | 'coerce' })
                        }
                      />
                    </Stack>
                  </Collapse>
                </Paper>
              </>
            )}
          </>
        )}
      </Stack>
    </div>
  );
};
