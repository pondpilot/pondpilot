import { updateSchemaComparison } from '@controllers/tab/comparison-tab-controller';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { useAppTheme } from '@hooks/use-app-theme';
import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Collapse,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  useMantineTheme,
  rgba,
} from '@mantine/core';
import { ComparisonConfig, ComparisonSource, SchemaComparisonResult, TabId } from '@models/tab';
import { IconAlertCircle, IconCheck, IconChevronDown, IconTable } from '@tabler/icons-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, RefObject } from 'react';

import { ColumnMapper } from './column-mapper';
import { JoinKeyMapper } from './join-key-mapper';
import { ICON_CLASSES } from '../constants/color-classes';
import { useComparisonSourceSelection } from '../hooks/use-comparison-source-selection';
import { useFilterValidation } from '../hooks/use-filter-validation';
import {
  COMPARISON_ANALYSIS_EVENT,
  hasComparisonDragData,
  parseComparisonDragData,
  requestComparisonAnalysis,
} from '../utils/comparison-integration';
import { getStatusAccentColor, getStatusSurfaceColor, getThemeColorValue } from '../utils/theme';

// Constants
const SCROLL_COLLAPSE_THRESHOLD = 100;
const SCROLL_EXPAND_THRESHOLD = 40;
const MIN_SCROLLABLE_DISTANCE = 160;

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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [dragTarget, setDragTarget] = useState<'A' | 'B' | null>(null);
  const [analysisRequestToken, setAnalysisRequestToken] = useState(0);

  // Track if we've triggered analysis for the current sources
  const analysisTriggeredRef = useRef<string | null>(null);
  const analysisRunIdRef = useRef<symbol | null>(null);
  const autoJoinInitializedRef = useRef<string | null>(null);

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

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const metrics = {
            scrollTop: container.scrollTop,
            scrollHeight: container.scrollHeight,
            clientHeight: container.clientHeight,
          };
          setIsCollapsed((prev) => evaluateCollapseState(prev, metrics));
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

    return () => container.removeEventListener('scroll', handleScroll);
  }, [evaluateCollapseState, scrollContainerRef]);

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
  // This effect orchestrates schema analysis based on source changes:
  // 1. Creates a `sourceKey` to uniquely identify the current pair of sources
  // 2. Uses `analysisTriggeredRef` to prevent re-running analysis for the same source pair
  // 3. Uses `analysisRunIdRef` with a unique Symbol to track the latest analysis run
  // 4. Handles race conditions: if sources change or a new analysis is requested via
  //    COMPARISON_ANALYSIS_EVENT before the old one completes, only the latest result is applied
  // 5. Skips analysis if:
  //    - Either source is missing (clears refs)
  //    - Analysis results already exist for this source pair
  //    - Analysis is already in progress
  //    - Analysis was already triggered for this exact source pair
  useEffect(() => {
    if (!config?.sourceA || !config?.sourceB) {
      analysisTriggeredRef.current = null;
      analysisRunIdRef.current = null;
      return undefined;
    }

    const sourceKey = createSourceKey(config.sourceA, config.sourceB);

    if (schemaComparison) {
      analysisTriggeredRef.current = sourceKey;
      return undefined;
    }

    if (isAnalyzing) {
      return undefined;
    }

    if (analysisTriggeredRef.current === sourceKey) {
      return undefined;
    }

    // Trigger analysis and mark as triggered
    analysisTriggeredRef.current = sourceKey;
    const runId = Symbol('comparison-analysis-run');
    analysisRunIdRef.current = runId;

    onAnalyzeSchemas(config.sourceA, config.sourceB).then((result) => {
      if (!result) {
        return;
      }
      const isLatestRun = analysisRunIdRef.current === runId;
      const isSameSources = analysisTriggeredRef.current === sourceKey;

      if (isLatestRun && isSameSources) {
        updateSchemaComparison(tabId, result);
      }
    });

    return undefined;
  }, [
    analysisRequestToken,
    config?.sourceA,
    config?.sourceB,
    onAnalyzeSchemas,
    schemaComparison,
    isAnalyzing,
    tabId,
  ]);

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

  const applySourceFromDrag = useCallback(
    (slot: 'A' | 'B', source: ComparisonSource) => {
      const currentSource = slot === 'A' ? config?.sourceA : config?.sourceB;
      const update: Partial<ComparisonConfig> =
        slot === 'A' ? { sourceA: source } : { sourceB: source };

      if (currentSource) {
        update.joinColumns = [];
        update.joinKeyMappings = {};
        update.columnMappings = {};
        update.excludedColumns = [];
      }

      onConfigChange(update);
      analysisTriggeredRef.current = null;
      updateSchemaComparison(tabId, null);

      const nextSourceA = slot === 'A' ? source : config?.sourceA;
      const nextSourceB = slot === 'B' ? source : config?.sourceB;
      if (nextSourceA && nextSourceB) {
        requestComparisonAnalysis(tabId);
      }
    },
    [config?.sourceA, config?.sourceB, onConfigChange, tabId],
  );

  const handleDragEnter = useCallback(
    (slot: 'A' | 'B') => (event: React.DragEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (hasComparisonDragData(event.dataTransfer)) {
        setDragTarget(slot);
      }
    },
    [],
  );

  const handleDragOver = useCallback(
    (slot: 'A' | 'B') => (event: React.DragEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!hasComparisonDragData(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      if (dragTarget !== slot) {
        setDragTarget(slot);
      }
    },
    [dragTarget],
  );

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) {
      return;
    }
    setDragTarget(null);
  }, []);

  const handleDrop = useCallback(
    (slot: 'A' | 'B') => (event: React.DragEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const source = parseComparisonDragData(event.dataTransfer);
      setDragTarget(null);
      if (!source) {
        return;
      }
      event.preventDefault();
      applySourceFromDrag(slot, source);
    },
    [applySourceFromDrag],
  );

  // Memoize bound handlers for Source A to prevent creating new functions on every render
  const handleDragEnterA = useMemo(() => handleDragEnter('A'), [handleDragEnter]);
  const handleDragOverA = useMemo(() => handleDragOver('A'), [handleDragOver]);
  const handleDropA = useMemo(() => handleDrop('A'), [handleDrop]);

  // Memoize bound handlers for Source B to prevent creating new functions on every render
  const handleDragEnterB = useMemo(() => handleDragEnter('B'), [handleDragEnter]);
  const handleDragOverB = useMemo(() => handleDragOver('B'), [handleDragOver]);
  const handleDropB = useMemo(() => handleDrop('B'), [handleDrop]);

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId: TabId }>;
      if (customEvent.detail?.tabId === tabId) {
        analysisTriggeredRef.current = null;
        setAnalysisRequestToken((token) => token + 1);
      }
    };

    window.addEventListener(COMPARISON_ANALYSIS_EVENT, listener as EventListener);
    return () => window.removeEventListener(COMPARISON_ANALYSIS_EVENT, listener as EventListener);
  }, [tabId]);

  // Get column options for MultiSelect
  const _getColumnOptions = (): { value: string; label: string }[] => {
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
                margin: theme.spacing.xl,
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
                  onDragEnter={handleDragEnterA}
                  onDragOver={handleDragOverA}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDropA}
                  style={
                    dragTarget === 'A'
                      ? {
                          borderColor: getStatusAccentColor(theme, 'added', colorScheme),
                          borderWidth: 2,
                          borderStyle: 'solid',
                        }
                      : undefined
                  }
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
                  onDragEnter={handleDragEnterB}
                  onDragOver={handleDragOverB}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDropB}
                  style={
                    dragTarget === 'B'
                      ? {
                          borderColor: getStatusAccentColor(theme, 'added', colorScheme),
                          borderWidth: 2,
                          borderStyle: 'solid',
                        }
                      : undefined
                  }
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
      </Stack>
    </div>
  );
};
