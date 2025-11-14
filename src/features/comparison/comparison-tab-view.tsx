import {
  setComparisonViewingResults,
  updateComparisonConfig,
  setComparisonExecutionTime,
  setComparisonResultsTable,
  updateSchemaComparison,
} from '@controllers/tab/comparison-tab-controller';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { Stack, LoadingOverlay, Alert, Text, Center } from '@mantine/core';
import { modals } from '@mantine/modals';
import { TabId, ComparisonConfig } from '@models/tab';
import { IconAlertCircle } from '@tabler/icons-react';
import { memo, useCallback, useRef, useEffect } from 'react';

import { AnimatedPollyDuck } from './components/animated-polly-duck';
import { ComparisonConfigScreen } from './components/comparison-config-screen';
import { ComparisonExecutionProgressCard } from './components/comparison-execution-progress-card';
import { ComparisonProgressErrorBoundary } from './components/comparison-progress-error-boundary';
import { ComparisonViewer } from './components/comparison-results/comparison-viewer';
import { ICON_CLASSES } from './constants/color-classes';
import { useComparison } from './hooks/use-comparison';
import { useComparisonExecution } from './hooks/use-comparison-execution';
import { useComparisonProgress } from './hooks/use-comparison-progress';
import { useComparisonProgressCleanup } from './hooks/use-comparison-progress-cleanup';
import { useSchemaAnalysis } from './hooks/use-schema-analysis';
import { createSourceKey } from './utils/source-comparison';

interface ComparisonTabViewProps {
  tabId: TabId;
  active: boolean;
}

export const ComparisonTabView = memo(({ tabId, active }: ComparisonTabViewProps) => {
  const data = useComparison(tabId);
  const pool = useInitializedDuckDBConnectionPool();
  const { analyzeSchemas, isAnalyzing, error: analysisError } = useSchemaAnalysis(pool);
  const {
    executeComparison,
    cancelComparison,
    finishEarlyComparison,
    isExecuting,
    error: executionError,
  } = useComparisonExecution(pool);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastAnalysisKeyRef = useRef<string | null>(null);
  const lastAnalysisFailedRef = useRef(false);

  // Set up periodic cleanup of stale comparison progress entries
  useComparisonProgressCleanup();

  const tab = data?.tab;
  const comparison = data?.comparison;
  const comparisonId = comparison?.id;
  const comparisonConfig = comparison?.config ?? null;
  const schemaComparison = comparison?.schemaComparison ?? null;
  const viewingResults = tab?.viewingResults ?? false;
  const resultsTableName = tab?.comparisonResultsTable || comparison?.resultsTableName || null;
  const lastExecutionTime = tab?.lastExecutionTime || comparison?.lastExecutionTime || null;

  const progress = useComparisonProgress(comparisonId ?? null);
  const progressStage = progress?.stage ?? null;
  const progressActive =
    progressStage !== null &&
    !['completed', 'cancelled', 'failed', 'partial'].includes(progressStage);
  const canFinishEarly = Boolean(
    progress?.supportsFinishEarly && progressActive && (progress?.diffRows ?? 0) > 0,
  );

  const handleConfigChange = useCallback(
    (configChanges: Partial<ComparisonConfig>) => {
      updateComparisonConfig(tabId, configChanges);
    },
    [tabId],
  );

  const handleBackToConfiguration = useCallback(() => {
    setComparisonViewingResults(tabId, false);
  }, [tabId]);

  const runComparison = useCallback(
    async (activateResults: boolean) => {
      if (!comparisonId || !comparisonConfig || !schemaComparison) return;

      const executionResult = await executeComparison(
        comparisonId,
        comparisonConfig,
        schemaComparison,
      );

      if (executionResult) {
        setComparisonExecutionTime(tabId, executionResult.durationSeconds);
        setComparisonResultsTable(tabId, executionResult.tableName);
        if (activateResults) {
          setComparisonViewingResults(tabId, true);
        }
      }
    },
    [tabId, comparisonId, comparisonConfig, schemaComparison, executeComparison],
  );

  const handleRefreshComparison = useCallback(() => {
    modals.openConfirmModal({
      title: 'Refresh comparison?',
      children: (
        <Text size="sm">
          This will re-run the comparison with the current configuration. Any existing results will
          be replaced.
        </Text>
      ),
      labels: { confirm: 'Refresh', cancel: 'Cancel' },
      confirmProps: { color: 'blue' },
      onConfirm: () => {
        runComparison(false).catch(() => {
          // Ignored: errors surfaced via executionError state
        });
      },
    });
  }, [runComparison]);

  const handleExecuteComparison = useCallback(() => {
    if (!comparisonConfig || !schemaComparison) return;

    const hasFilters =
      comparisonConfig.filterMode === 'common'
        ? Boolean(comparisonConfig.commonFilter?.trim())
        : Boolean(comparisonConfig.filterA?.trim()) || Boolean(comparisonConfig.filterB?.trim());

    if (!hasFilters) {
      modals.openConfirmModal({
        title: 'Run comparison without filters?',
        children: (
          <Text size="sm">
            This will compare the entire datasets. Large tables may take longer to process.
          </Text>
        ),
        labels: { confirm: 'Run comparison', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        onConfirm: () => {
          runComparison(true).catch(() => {
            // Ignored: errors surfaced via executionError state
          });
        },
      });
      return;
    }

    runComparison(true).catch(() => {
      // Ignored: errors surfaced via executionError state
    });
  }, [comparisonConfig, schemaComparison, runComparison]);

  const handleCancelExecution = useCallback(() => {
    if (!comparisonId) return;

    modals.openConfirmModal({
      title: 'Cancel comparison?',
      children: (
        <Text size="sm">
          The current comparison will stop immediately. You can rerun it anytime from the
          configuration screen.
        </Text>
      ),
      labels: { confirm: 'Cancel comparison', cancel: 'Keep running' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        cancelComparison(comparisonId);
      },
    });
  }, [cancelComparison, comparisonId]);

  const handleFinishEarlyExecution = useCallback(() => {
    if (!comparisonId) return;

    modals.openConfirmModal({
      title: 'Finish comparison now?',
      children: (
        <Text size="sm">
          We will stop scanning immediately and show the differences found so far. You can rerun
          later to complete the comparison.
        </Text>
      ),
      labels: { confirm: 'Finish early', cancel: 'Keep running' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        finishEarlyComparison(comparisonId);
      },
    });
  }, [finishEarlyComparison, comparisonId]);

  // Automatically trigger schema analysis when both sources are configured but schema is not analyzed
  useEffect(() => {
    const sourceA = comparisonConfig?.sourceA ?? null;
    const sourceB = comparisonConfig?.sourceB ?? null;

    if (!sourceA || !sourceB) {
      lastAnalysisKeyRef.current = null;
      lastAnalysisFailedRef.current = false;
      return;
    }

    if (schemaComparison || isAnalyzing || isExecuting || progressActive || !comparisonId) {
      return;
    }

    const sourceKey = createSourceKey(sourceA, sourceB);

    if (lastAnalysisFailedRef.current && lastAnalysisKeyRef.current === sourceKey) {
      return;
    }

    lastAnalysisKeyRef.current = sourceKey;

    analyzeSchemas(sourceA, sourceB, comparisonId)
      .then((result) => {
        if (result) {
          updateSchemaComparison(tabId, result);
          lastAnalysisFailedRef.current = false;
        } else {
          lastAnalysisFailedRef.current = true;
        }
      })
      .catch(() => {
        lastAnalysisFailedRef.current = true;
      });
  }, [
    comparisonConfig?.sourceA,
    comparisonConfig?.sourceB,
    schemaComparison,
    isAnalyzing,
    isExecuting,
    progressActive,
    comparisonId,
    tabId,
    analyzeSchemas,
  ]);

  const canRun =
    !!comparisonConfig?.sourceA &&
    !!comparisonConfig?.sourceB &&
    !!schemaComparison &&
    (comparisonConfig?.joinColumns || []).length > 0;

  // Show the main loading overlay only when analyzing the schema.
  // During execution, we'll show the animated Polly duck instead.
  const showLoadingOverlay = isAnalyzing;

  const datasetNameA = comparisonConfig?.sourceA
    ? comparisonConfig.sourceA.type === 'table'
      ? comparisonConfig.sourceA.tableName
      : comparisonConfig.sourceA.alias
    : 'Dataset A';

  const datasetNameB = comparisonConfig?.sourceB
    ? comparisonConfig.sourceB.type === 'table'
      ? comparisonConfig.sourceB.tableName
      : comparisonConfig.sourceB.alias
    : 'Dataset B';

  if (!data) {
    return null;
  }

  if (!active) {
    return null;
  }

  return (
    <div ref={scrollContainerRef} className="relative h-full overflow-auto">
      <LoadingOverlay visible={showLoadingOverlay} overlayProps={{ blur: 2 }} />

      <Stack gap="xl" p={viewingResults ? 'xl' : 0}>
        {analysisError && (
          <Alert
            icon={<IconAlertCircle size={16} className={ICON_CLASSES.error} />}
            title="Analysis Error"
            color="background-error"
          >
            {analysisError}
          </Alert>
        )}

        {executionError && (
          <Alert
            icon={<IconAlertCircle size={16} className={ICON_CLASSES.error} />}
            title={<Text c="text-error">Execution Error</Text>}
            color="text-error"
          >
            {executionError}
          </Alert>
        )}

        {(progressActive || isExecuting) && (
          <Center className="w-full" style={{ minHeight: '60vh' }}>
            <Stack gap="xl" align="center">
              <AnimatedPollyDuck
                size={100}
                datasetNameA={datasetNameA}
                datasetNameB={datasetNameB}
              />
              {progressActive && progress && (
                <ComparisonProgressErrorBoundary>
                  <ComparisonExecutionProgressCard
                    progress={progress}
                    onCancel={handleCancelExecution}
                    onFinishEarly={canFinishEarly ? handleFinishEarlyExecution : undefined}
                  />
                </ComparisonProgressErrorBoundary>
              )}
            </Stack>
          </Center>
        )}

        {!progressActive && !isExecuting && !viewingResults && (
          <ComparisonConfigScreen
            tabId={tabId}
            comparisonId={comparisonId ?? null}
            config={comparisonConfig}
            schemaComparison={schemaComparison}
            onConfigChange={handleConfigChange}
            onAnalyzeSchemas={analyzeSchemas}
            isAnalyzing={isAnalyzing}
            onRun={handleExecuteComparison}
            canRun={canRun}
            isRunning={isExecuting || progressActive}
            scrollContainerRef={scrollContainerRef}
          />
        )}

        {!progressActive &&
          !isExecuting &&
          viewingResults &&
          comparisonId &&
          comparisonConfig &&
          schemaComparison &&
          resultsTableName &&
          lastExecutionTime && (
            <ComparisonViewer
              tabId={tabId}
              comparisonId={comparisonId}
              config={comparisonConfig}
              schemaComparison={schemaComparison}
              tableName={resultsTableName}
              executionTime={lastExecutionTime}
              lastRunAt={comparison?.lastRunAt ?? null}
              onReconfigure={handleBackToConfiguration}
              onRefresh={handleRefreshComparison}
            />
          )}
      </Stack>
    </div>
  );
});

ComparisonTabView.displayName = 'ComparisonTabView';
