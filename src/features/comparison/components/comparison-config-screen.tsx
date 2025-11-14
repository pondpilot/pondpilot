import { showError, showSuccess } from '@components/app-notifications';
import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { updateSchemaComparison } from '@controllers/tab/comparison-tab-controller';
import { useInitializedDatabaseConnectionPool } from '@features/database-context';
import { useAppTheme } from '@hooks/use-app-theme';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  Tooltip,
  useMantineTheme,
  rgba,
} from '@mantine/core';
import type { ComparisonId } from '@models/comparison';
import { ComparisonConfig, ComparisonSource, SchemaComparisonResult, TabId } from '@models/tab';
import {
  IconAlertCircle,
  IconArrowsDiff,
  IconCheck,
  IconCode,
  IconInfoCircle,
  IconTable,
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, RefObject, useMemo } from 'react';

import { ColumnMapper } from './column-mapper';
import { JoinKeyMapper } from './join-key-mapper';
import { SamplingAlgorithm } from '../algorithms/sampling-algorithm';
import { ICON_CLASSES } from '../constants/color-classes';
import { getDragOverStyle } from '../constants/dnd-styles';
import { useComparisonSourceSelection } from '../hooks/use-comparison-source-selection';
import { useDatasetDropTarget } from '../hooks/use-dataset-drop-target';
import { useFilterValidation } from '../hooks/use-filter-validation';
import { areSourcesEqual, createSourceKey } from '../utils/source-comparison';
import { generateComparisonSQL } from '../utils/sql-generator';
import { getStatusAccentColor, getStatusSurfaceColor, getThemeColorValue } from '../utils/theme';

// Constants
const SCROLL_COLLAPSE_THRESHOLD = 120;
const SCROLL_EXPAND_THRESHOLD = 20;
const MIN_SCROLLABLE_DISTANCE = 160;

interface ComparisonConfigScreenProps {
  tabId: TabId;
  config: ComparisonConfig | null;
  schemaComparison: SchemaComparisonResult | null;
  onConfigChange: (config: Partial<ComparisonConfig>) => void;
  onAnalyzeSchemas: (
    sourceA: ComparisonSource,
    sourceB: ComparisonSource,
    comparisonId?: ComparisonId | null,
  ) => Promise<SchemaComparisonResult | null>;
  isAnalyzing: boolean;
  onRun: () => void;
  canRun: boolean;
  isRunning: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  comparisonId: ComparisonId | null;
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
  comparisonId,
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
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Track if we've triggered analysis for the current sources
  const analysisTriggeredRef = useRef<string | null>(null);
  const autoJoinInitializedRef = useRef<string | null>(null);

  // Get DuckDB pool for filter validation
  const pool = useInitializedDatabaseConnectionPool();

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

  const duplicateSourceSelected = useMemo(
    () => areSourcesEqual(config?.sourceA ?? null, config?.sourceB ?? null),
    [config?.sourceA, config?.sourceB],
  );

  // Validate filters
  const commonFilterValidation = useFilterValidation(
    pool,
    config?.commonFilter || '',
    commonFilterContexts,
  );
  const filterAValidation = useFilterValidation(pool, config?.filterA || '', filterAContexts);
  const filterBValidation = useFilterValidation(pool, config?.filterB || '', filterBContexts);

  // Detect scroll to auto-collapse header
  const evaluateCollapseState = useCallback(
    (
      prev: boolean,
      metrics: { scrollTop: number; scrollHeight: number; clientHeight: number },
    ): boolean => {
      const { scrollTop, scrollHeight, clientHeight } = metrics;
      const canCollapse = scrollHeight - clientHeight > MIN_SCROLLABLE_DISTANCE;

      if (prev) {
        if (scrollTop < SCROLL_EXPAND_THRESHOLD) {
          return false;
        }
        if (!canCollapse && scrollTop < SCROLL_COLLAPSE_THRESHOLD) {
          return false;
        }
        return true;
      }

      if (!canCollapse) {
        return false;
      }

      if (scrollTop > SCROLL_COLLAPSE_THRESHOLD) {
        return true;
      }

      return false;
    },
    [],
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let ticking = false;
    let debounceTimeout: NodeJS.Timeout | null = null;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const metrics = {
            scrollTop: container.scrollTop,
            scrollHeight: container.scrollHeight,
            clientHeight: container.clientHeight,
          };

          // Clear any pending debounce
          if (debounceTimeout) {
            clearTimeout(debounceTimeout);
          }

          // Debounce state changes to prevent rapid toggling
          debounceTimeout = setTimeout(() => {
            setIsCollapsed((prev) => evaluateCollapseState(prev, metrics));
            debounceTimeout = null;
          }, 50);

          ticking = false;
        });
        ticking = true;
      }
    };

    // Initialize collapse state
    const initializeState = () => {
      const metrics = {
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      };
      setIsCollapsed((prev) => evaluateCollapseState(prev, metrics));
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    initializeState();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [evaluateCollapseState, scrollContainerRef]);

  const handleSourceAChange = useCallback(
    (source: ComparisonSource | null) => {
      if (!source) return;
      onConfigChange({ sourceA: source });
      analysisTriggeredRef.current = null;
      updateSchemaComparison(tabId, null);
    },
    [onConfigChange, tabId],
  );

  const handleSourceBChange = useCallback(
    (source: ComparisonSource | null) => {
      if (!source) return;
      onConfigChange({ sourceB: source });
      analysisTriggeredRef.current = null;
      updateSchemaComparison(tabId, null);
    },
    [onConfigChange, tabId],
  );

  // Source selection hook
  const { selectSourceA, selectSourceB } = useComparisonSourceSelection(
    handleSourceAChange,
    handleSourceBChange,
  );

  // Drag-and-drop hooks for source selection
  const { isDragOver: isSourceADragOver, dropHandlers: sourceADropHandlers } = useDatasetDropTarget(
    {
      onDrop: handleSourceAChange,
      acceptFilter: (source) => source.type === 'table',
      errorMessage: 'Only table sources can be used for comparison',
    },
  );

  const { isDragOver: isSourceBDragOver, dropHandlers: sourceBDropHandlers } = useDatasetDropTarget(
    {
      onDrop: handleSourceBChange,
      acceptFilter: (source) => source.type === 'table',
      errorMessage: 'Only table sources can be used for comparison',
    },
  );

  // Helper to format source display name
  const getSourceDisplayName = useCallback((source: ComparisonSource | null): string => {
    if (!source) return 'Not selected';
    if (source.type === 'table') {
      const parts = [source.databaseName, source.schemaName, source.tableName].filter(Boolean);
      return parts.join('.');
    }
    return source.alias;
  }, []);

  const handleOpenSqlInEditor = useCallback(() => {
    if (!config || !config.sourceA || !config.sourceB || !schemaComparison) {
      showError({
        title: 'SQL unavailable',
        message: 'Select both sources and analyze schemas before opening the query in the editor.',
      });
      return;
    }

    try {
      let sql: string;
      if (config.algorithm === 'sampling') {
        const sampler = new SamplingAlgorithm();
        sql = sampler.buildPreviewSQL(config, schemaComparison);
      } else {
        sql = generateComparisonSQL(config, schemaComparison, { includeOrderBy: true });
      }
      const scriptLabel = `${getSourceDisplayName(config.sourceA)} vs ${getSourceDisplayName(
        config.sourceB,
      )} comparison`;
      const scriptName = scriptLabel.trim() || 'comparison-sql';
      const script = createSQLScript(scriptName, sql);
      getOrCreateTabFromScript(script, true);
      showSuccess({
        title: 'Query opened in editor',
        message: 'Review or customize the generated comparison SQL in the new tab.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showError({
        title: 'Failed to build SQL',
        message,
      });
    }
  }, [config, schemaComparison, getSourceDisplayName]);

  // Auto-trigger schema analysis when both sources are selected
  useEffect(() => {
    if (!config?.sourceA || !config?.sourceB) {
      // Clear analysis flag if sources are incomplete
      analysisTriggeredRef.current = null;
      return;
    }

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

    onAnalyzeSchemas(config.sourceA, config.sourceB, comparisonId).then((result) => {
      // Only update if this analysis is still relevant (sources haven't changed)
      if (!cancelled && result && analysisTriggeredRef.current === sourceKey) {
        updateSchemaComparison(tabId, result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [config?.sourceA, config?.sourceB, onAnalyzeSchemas, tabId, comparisonId]);

  useEffect(() => {
    if (!config?.sourceA || !config?.sourceB || !schemaComparison) {
      autoJoinInitializedRef.current = null;
      return;
    }

    const suggestionsSignature = `${createSourceKey(config.sourceA, config.sourceB)}|${JSON.stringify(schemaComparison.suggestedKeys)}`;

    if (autoJoinInitializedRef.current === suggestionsSignature) {
      return;
    }

    if ((config.joinColumns?.length ?? 0) > 0 || schemaComparison.suggestedKeys.length === 0) {
      autoJoinInitializedRef.current = suggestionsSignature;
      return;
    }

    const cleanedMappings = Object.fromEntries(
      Object.entries(config?.joinKeyMappings || {}).filter(([key]) =>
        schemaComparison.suggestedKeys.includes(key),
      ),
    );

    onConfigChange({
      joinColumns: schemaComparison.suggestedKeys,
      joinKeyMappings: cleanedMappings,
    });

    autoJoinInitializedRef.current = suggestionsSignature;
  }, [
    config?.sourceA,
    config?.sourceB,
    config?.joinColumns,
    config?.joinKeyMappings,
    schemaComparison,
    onConfigChange,
  ]);

  // Handle filter mode change
  const handleFilterModeChange = (mode: 'common' | 'separate') => {
    onConfigChange({ filterMode: mode });
  };

  // Check if configuration is valid
  const hasValidConfig = config?.sourceA && config?.sourceB;
  const hasSchemaAnalysis = !!schemaComparison;
  const hasJoinKeys = (config?.joinColumns || []).length > 0;
  const hasTypeMismatches = schemaComparison?.commonColumns.some((col) => !col.typesMatch) || false;
  const isSqlPreviewAlgorithm = config?.algorithm === 'join' || config?.algorithm === 'sampling';
  const canGenerateSqlScript = hasValidConfig && hasSchemaAnalysis && hasJoinKeys;
  const shouldShowOpenSqlButton = isSqlPreviewAlgorithm;
  const canOpenSqlButton = shouldShowOpenSqlButton && canGenerateSqlScript;

  const renderSourceSelector = ({
    label,
    source,
    onClick,
    dropHandlers,
    isDragOver,
  }: {
    label: string;
    source: ComparisonSource | null;
    onClick: () => void;
    dropHandlers: ReturnType<typeof useDatasetDropTarget>['dropHandlers'];
    isDragOver: boolean;
  }) => (
    <Stack key={label} gap="xs">
      <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
        {label}
      </Text>
      <Button
        variant={source ? 'light' : 'default'}
        leftSection={<IconTable size={16} />}
        onClick={onClick}
        {...dropHandlers}
        color={duplicateSourceSelected ? 'red' : 'background-accent'}
        style={isDragOver ? getDragOverStyle(theme, colorScheme) : undefined}
        fullWidth
      >
        {getSourceDisplayName(source || null)}
      </Button>
    </Stack>
  );

  const primaryActions = (
    <Group gap="xs" wrap="nowrap">
      {shouldShowOpenSqlButton ? (
        <Tooltip label="Open SQL in editor" withArrow>
          <ActionIcon
            variant="filled"
            size="sm"
            color="icon-accent"
            aria-label="Open SQL in editor"
            disabled={!canOpenSqlButton}
            onClick={handleOpenSqlInEditor}
          >
            <IconCode size={14} />
          </ActionIcon>
        </Tooltip>
      ) : null}
      <Button onClick={onRun} disabled={!canRun || isRunning} loading={isRunning}>
        Run Comparison
      </Button>
    </Group>
  );

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
          transition: 'all 350ms cubic-bezier(0.4, 0.0, 0.2, 1)',
          ...(isCollapsed
            ? {
                borderRadius: 0,
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                paddingLeft: theme.spacing.xl,
                paddingRight: theme.spacing.xl,
              }
            : {
                margin: theme.spacing.md,
              }),
        }}
      >
        {isCollapsed ? (
          // Collapsed state - single compact row
          <Group justify="space-between" align="center" gap="md" wrap="nowrap">
            <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
              <Text
                size="sm"
                fw={500}
                style={{ whiteSpace: 'nowrap' }}
                c={duplicateSourceSelected ? 'red' : undefined}
              >
                {getSourceDisplayName(config?.sourceA || null)}
              </Text>
              <Text size="sm" c={duplicateSourceSelected ? 'red' : 'dimmed'}>
                <IconArrowsDiff
                  size={16}
                  className="text-textPrimary-light dark:text-textPrimary-dark"
                />
              </Text>
              <Text
                size="sm"
                fw={500}
                style={{ whiteSpace: 'nowrap' }}
                c={duplicateSourceSelected ? 'red' : undefined}
              >
                {getSourceDisplayName(config?.sourceB || null)}
              </Text>
            </Group>
            {primaryActions}
          </Group>
        ) : (
          // Expanded state - full UI
          <>
            <Group justify="space-between" mb="md">
              <Text size="sm" fw={600}>
                Data Sources
              </Text>
              {primaryActions}
            </Group>
            <Group grow>
              {renderSourceSelector({
                label: 'Source A',
                source: config?.sourceA || null,
                onClick: selectSourceA,
                dropHandlers: sourceADropHandlers,
                isDragOver: isSourceADragOver,
              })}
              {renderSourceSelector({
                label: 'Source B',
                source: config?.sourceB || null,
                onClick: selectSourceB,
                dropHandlers: sourceBDropHandlers,
                isDragOver: isSourceBDragOver,
              })}
            </Group>
            {duplicateSourceSelected && (
              <Alert
                mt="md"
                variant="light"
                color="background-warning"
                icon={<IconAlertCircle size={16} className={ICON_CLASSES.warning} />}
                styles={getAlertStyles('warning')}
              >
                Source A and Source B reference the same dataset. Select a different dataset for a
                meaningful comparison.
              </Alert>
            )}
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
            {/* Schema Comparison */}
            <Paper p="md" withBorder>
              <Text size="sm" fw={600} mb="md">
                Schema Comparison
              </Text>

              {/* Summary stats */}
              <Group gap="md" mb="md">
                {schemaComparison.commonColumns.filter((c) => c.typesMatch).length > 0 && (
                  <Text size="sm" c="dimmed">
                    {schemaComparison.commonColumns.filter((c) => c.typesMatch).length} column
                    {schemaComparison.commonColumns.filter((c) => c.typesMatch).length > 1
                      ? 's'
                      : ''}{' '}
                    matched
                  </Text>
                )}

                {schemaComparison.commonColumns.filter((c) => !c.typesMatch).length > 0 && (
                  <Group gap="xs">
                    <IconAlertCircle size={16} className={ICON_CLASSES.warning} />
                    <Text size="sm" c="text-warning">
                      {schemaComparison.commonColumns.filter((c) => !c.typesMatch).length} partial
                      match
                      {schemaComparison.commonColumns.filter((c) => !c.typesMatch).length > 1
                        ? 'es'
                        : ''}{' '}
                      (type differs)
                    </Text>
                  </Group>
                )}

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

              <Stack gap="lg">
                {/* Matched Columns */}
                {schemaComparison.commonColumns.filter((c) => c.typesMatch).length > 0 && (
                  <Box>
                    <Group
                      gap="md"
                      wrap="nowrap"
                      mb="xs"
                      p="xs"
                      style={{
                        backgroundColor:
                          colorScheme === 'dark'
                            ? rgba(theme.white, 0.02)
                            : rgba(theme.black, 0.02),
                        borderRadius: theme.radius.sm,
                      }}
                    >
                      <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ flex: 1 }}>
                        Matched Columns
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
                      <Text
                        size="xs"
                        c="dimmed"
                        fw={600}
                        tt="uppercase"
                        style={{ width: 120, textAlign: 'center' }}
                      >
                        B
                      </Text>
                    </Group>
                    <Stack gap="sm">
                      {schemaComparison.commonColumns
                        .filter((c) => c.typesMatch)
                        .map((col) => (
                          <Group key={col.name} gap="md" wrap="nowrap" px="xs">
                            <Text size="sm" fw={500} style={{ flex: 1 }}>
                              {col.name}
                            </Text>
                            <Badge
                              size="sm"
                              variant="light"
                              style={{
                                width: 120,
                                backgroundColor: getStatusSurfaceColor(theme, 'added', colorScheme),
                                color: getStatusAccentColor(theme, 'added', colorScheme),
                              }}
                            >
                              {col.typeA}
                            </Badge>
                            <Badge
                              size="sm"
                              variant="light"
                              style={{
                                width: 120,
                                backgroundColor: getStatusSurfaceColor(theme, 'added', colorScheme),
                                color: getStatusAccentColor(theme, 'added', colorScheme),
                              }}
                            >
                              {col.typeB}
                            </Badge>
                          </Group>
                        ))}
                    </Stack>
                  </Box>
                )}

                {/* Partial Matches (name matches, type differs) */}
                {schemaComparison.commonColumns.filter((c) => !c.typesMatch).length > 0 && (
                  <Box>
                    <Group
                      gap="md"
                      wrap="nowrap"
                      mb="xs"
                      p="xs"
                      style={{
                        backgroundColor:
                          colorScheme === 'dark'
                            ? rgba(theme.white, 0.02)
                            : rgba(theme.black, 0.02),
                        borderRadius: theme.radius.sm,
                      }}
                    >
                      <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ flex: 1 }}>
                        Partial Matches (Type Differs)
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
                      <Text
                        size="xs"
                        c="dimmed"
                        fw={600}
                        tt="uppercase"
                        style={{ width: 120, textAlign: 'center' }}
                      >
                        B
                      </Text>
                    </Group>
                    <Stack gap="sm">
                      {schemaComparison.commonColumns
                        .filter((c) => !c.typesMatch)
                        .map((col) => {
                          const badgeStyles = {
                            backgroundColor: getStatusSurfaceColor(theme, 'modified', colorScheme),
                            color: getStatusAccentColor(theme, 'modified', colorScheme),
                          } as const;

                          return (
                            <Group key={col.name} gap="md" wrap="nowrap" px="xs">
                              <Text size="sm" fw={500} style={{ flex: 1 }}>
                                {col.name}
                              </Text>
                              <Badge
                                size="sm"
                                variant="light"
                                style={{ width: 120, ...badgeStyles }}
                              >
                                {col.typeA}
                              </Badge>
                              <Group gap="xs" wrap="nowrap" style={{ width: 120 }}>
                                <Badge
                                  size="sm"
                                  variant="light"
                                  style={{ width: 96, ...badgeStyles }}
                                >
                                  {col.typeB}
                                </Badge>
                                <IconAlertCircle
                                  size={14}
                                  className={ICON_CLASSES.warning}
                                  title="Type mismatch"
                                />
                              </Group>
                            </Group>
                          );
                        })}
                    </Stack>
                  </Box>
                )}

                {/* Only in Source A */}
                {schemaComparison.onlyInA.length > 0 && (
                  <Box>
                    <Group
                      gap="md"
                      wrap="nowrap"
                      mb="xs"
                      p="xs"
                      style={{
                        backgroundColor:
                          colorScheme === 'dark'
                            ? rgba(theme.white, 0.02)
                            : rgba(theme.black, 0.02),
                        borderRadius: theme.radius.sm,
                      }}
                    >
                      <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ flex: 1 }}>
                        Only in Source A
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
                      <Text
                        size="xs"
                        c="dimmed"
                        fw={600}
                        tt="uppercase"
                        style={{ width: 120, textAlign: 'center' }}
                      >
                        B
                      </Text>
                    </Group>
                    <Stack gap="sm">
                      {schemaComparison.onlyInA.map((col) => (
                        <Group key={col.name} gap="md" wrap="nowrap" px="xs">
                          <Text size="sm" fw={500} style={{ flex: 1 }}>
                            {col.name}
                          </Text>
                          <Badge
                            size="sm"
                            variant="light"
                            style={{
                              width: 120,
                              backgroundColor: getStatusSurfaceColor(theme, 'removed', colorScheme),
                              color: getStatusAccentColor(theme, 'removed', colorScheme),
                            }}
                          >
                            {col.type}
                          </Badge>
                          <Box style={{ width: 120 }}>
                            <Text size="xs" c="dimmed" style={{ textAlign: 'center' }}>
                              —
                            </Text>
                          </Box>
                        </Group>
                      ))}
                    </Stack>
                  </Box>
                )}

                {/* Only in Source B */}
                {schemaComparison.onlyInB.length > 0 && (
                  <Box>
                    <Group
                      gap="md"
                      wrap="nowrap"
                      mb="xs"
                      p="xs"
                      style={{
                        backgroundColor:
                          colorScheme === 'dark'
                            ? 'rgba(255, 255, 255, 0.02)'
                            : 'rgba(0, 0, 0, 0.02)',
                        borderRadius: theme.radius.sm,
                      }}
                    >
                      <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ flex: 1 }}>
                        Only in Source B
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
                      <Text
                        size="xs"
                        c="dimmed"
                        fw={600}
                        tt="uppercase"
                        style={{ width: 120, textAlign: 'center' }}
                      >
                        B
                      </Text>
                    </Group>
                    <Stack gap="sm">
                      {schemaComparison.onlyInB.map((col) => (
                        <Group key={col.name} gap="md" wrap="nowrap" px="xs">
                          <Text size="sm" fw={500} style={{ flex: 1 }}>
                            {col.name}
                          </Text>
                          <Box style={{ width: 120 }}>
                            <Text size="xs" c="dimmed" style={{ textAlign: 'center' }}>
                              —
                            </Text>
                          </Box>
                          <Badge
                            size="sm"
                            variant="light"
                            style={{
                              width: 120,
                              backgroundColor: getStatusSurfaceColor(theme, 'removed', colorScheme),
                              color: getStatusAccentColor(theme, 'removed', colorScheme),
                            }}
                          >
                            {col.type}
                          </Badge>
                        </Group>
                      ))}
                    </Stack>
                  </Box>
                )}
              </Stack>

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
                    {schemaComparison.commonColumns.filter((col) => !col.typesMatch).length} type
                    mismatches detected. Consider enabling &apos;Coerce&apos; mode in advanced
                    options to automatically convert types during comparison.
                  </Text>
                </Alert>
              )}
            </Paper>

            {/* Join Keys Section - unified selection and mapping */}
            <JoinKeyMapper
              schemaComparison={schemaComparison}
              joinColumns={config?.joinColumns || []}
              joinKeyMappings={config?.joinKeyMappings || {}}
              onJoinColumnsChange={(columns) => onConfigChange({ joinColumns: columns })}
              onMappingsChange={(mappings) => onConfigChange({ joinKeyMappings: mappings })}
            />

            {/* Column Mapping Section */}
            {hasJoinKeys && (
              <ColumnMapper
                schemaComparison={schemaComparison}
                columnMappings={config?.columnMappings || {}}
                joinColumns={config?.joinColumns || []}
                joinKeyMappings={config?.joinKeyMappings || {}}
                onMappingsChange={(mappings) => onConfigChange({ columnMappings: mappings })}
                excludedColumns={config?.excludedColumns || []}
                onExcludedColumnsChange={(columns) => onConfigChange({ excludedColumns: columns })}
              />
            )}

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
                  {commonFilterValidation.state === 'invalid' && commonFilterValidation.error && (
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
              <Stack gap="md">
                <Text size="sm" fw={600}>
                  Advanced
                </Text>

                <Checkbox
                  label="Show only rows with differences"
                  checked={config?.showOnlyDifferences ?? true}
                  onChange={(e) => onConfigChange({ showOnlyDifferences: e.currentTarget.checked })}
                />

                <Select
                  label={
                    <Group gap="xs" align="center">
                      <Text size="sm">Comparison method</Text>
                      <Tooltip
                        multiline
                        maw={300}
                        label={
                          <Stack gap="xs">
                            {[
                              {
                                title: 'Auto',
                                description:
                                  'Automatically selects the best method based on dataset size and available memory.',
                              },
                              {
                                title: 'Hash diff',
                                description:
                                  'Memory-efficient method ideal for very large datasets. Processes data in buckets to minimize memory usage.',
                              },
                              {
                                title: 'Full outer join',
                                description:
                                  'Faster for smaller datasets. Uses a single SQL query to compare all rows at once.',
                              },
                              {
                                title: 'Random sampling',
                                description:
                                  'Quick preview of differences using a 1% random sample (1k-100k rows). Best for large datasets when you need a quick overview.',
                              },
                            ].map((item) => (
                              <div key={item.title}>
                                <Text size="xs" fw={600} c="text-contrast">
                                  {item.title}:
                                </Text>
                                <Text c="text-contrast" size="xs">
                                  {item.description}
                                </Text>
                              </div>
                            ))}
                          </Stack>
                        }
                      >
                        <ActionIcon variant="subtle" size="xs" color="gray">
                          <IconInfoCircle size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  }
                  comboboxProps={{
                    position: 'top',
                    transitionProps: { transition: 'pop', duration: 200 },
                  }}
                  data={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'hash-bucket', label: 'Hash diff' },
                    { value: 'join', label: 'Full outer join' },
                    { value: 'sampling', label: 'Random sampling' },
                  ]}
                  value={config?.algorithm ?? 'auto'}
                  onChange={(value) =>
                    onConfigChange({
                      algorithm: (value as ComparisonConfig['algorithm']) ?? 'auto',
                    })
                  }
                />

                <Select
                  label="Compare mode"
                  data={[
                    { value: 'strict', label: 'Strict (exact types)' },
                    { value: 'coerce', label: 'Coerce (convert types)' },
                  ]}
                  comboboxProps={{
                    position: 'top',
                    transitionProps: { transition: 'pop', duration: 200 },
                  }}
                  value={config?.compareMode || 'strict'}
                  onChange={(value) =>
                    onConfigChange({ compareMode: value as 'strict' | 'coerce' })
                  }
                />
              </Stack>
            </Paper>
          </>
        )}
      </Stack>
    </div>
  );
};
