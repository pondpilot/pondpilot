import {
  setComparisonViewingResults,
  updateComparisonConfig,
  setComparisonExecutionTime,
  setComparisonResultsTable,
} from '@controllers/tab/comparison-tab-controller';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { useAppTheme } from '@hooks/use-app-theme';
import { Stack, LoadingOverlay, Alert, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { TabId, ComparisonConfig } from '@models/tab';
import { IconAlertCircle } from '@tabler/icons-react';
import { memo, useCallback, useRef, useEffect, useState } from 'react';

import { ComparisonConfigScreen } from './components/comparison-config-screen';
import { ComparisonExecutionProgress } from './components/comparison-execution-progress';
import { ComparisonViewer } from './components/comparison-results/comparison-viewer';
import { ICON_CLASSES } from './constants/color-classes';
import { useComparison } from './hooks/use-comparison';
import { useComparisonExecution } from './hooks/use-comparison-execution';
import { useSchemaAnalysis } from './hooks/use-schema-analysis';

interface ComparisonTabViewProps {
  tabId: TabId;
  active: boolean;
}

export const ComparisonTabView = memo(({ tabId, active }: ComparisonTabViewProps) => {
  const data = useComparison(tabId);
  const pool = useInitializedDuckDBConnectionPool();
  const { analyzeSchemas, isAnalyzing, error: analysisError } = useSchemaAnalysis(pool);
  const { executeComparison, isExecuting, error: executionError } = useComparisonExecution(pool);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showExecutionProgress, setShowExecutionProgress] = useState(false);
  const colorScheme = useAppTheme();

  const EXECUTION_PROGRESS_DELAY_MS = 1500;

  const tab = data?.tab;
  const comparison = data?.comparison;
  const comparisonId = comparison?.id;
  const comparisonConfig = comparison?.config ?? null;
  const schemaComparison = comparison?.schemaComparison ?? null;
  const viewingResults = tab?.viewingResults ?? false;
  const resultsTableName = tab?.comparisonResultsTable || comparison?.resultsTableName || null;
  const lastExecutionTime = tab?.lastExecutionTime || comparison?.lastExecutionTime || null;

  const handleConfigChange = useCallback(
    (configChanges: Partial<ComparisonConfig>) => {
      updateComparisonConfig(tabId, configChanges);
    },
    [tabId],
  );

  const handleBackToConfiguration = useCallback(() => {
    setComparisonViewingResults(tabId, false);
    setShowExecutionProgress(false);
  }, [tabId, setComparisonViewingResults, setShowExecutionProgress]);

  const handleResultsLoaded = useCallback(() => {
    setShowExecutionProgress(false);
  }, [setShowExecutionProgress]);

  const runComparison = useCallback(
    async (activateResults: boolean) => {
      if (!comparisonId || !comparisonConfig || !schemaComparison) return;

      if (activateResults) {
        setComparisonViewingResults(tabId, true);
      }
      setShowExecutionProgress(true);

      try {
        const executionResult = await executeComparison(
          comparisonId,
          comparisonConfig,
          schemaComparison,
        );

        if (executionResult) {
          setComparisonExecutionTime(tabId, executionResult.durationSeconds);
          setComparisonResultsTable(tabId, executionResult.tableName);
        } else {
          if (activateResults) {
            setComparisonViewingResults(tabId, false);
          }
          setShowExecutionProgress(false);
        }
      } catch (err) {
        if (activateResults) {
          setComparisonViewingResults(tabId, false);
        }
        setShowExecutionProgress(false);
      }
    },
    [
      tabId,
      comparisonId,
      comparisonConfig,
      schemaComparison,
      executeComparison,
      setShowExecutionProgress,
    ],
  );

  const handleRefreshComparison = useCallback(async () => {
    await runComparison(false);
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

  useEffect(() => {
    if (!isExecuting || showExecutionProgress) {
      return;
    }
    const timer = setTimeout(() => {
      setShowExecutionProgress(true);
    }, EXECUTION_PROGRESS_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [isExecuting, showExecutionProgress]);

  // Compute canRun for the header
  const canRun =
    !!comparisonConfig?.sourceA &&
    !!comparisonConfig?.sourceB &&
    !!schemaComparison &&
    (comparisonConfig?.joinColumns || []).length > 0;

  const showProgressScreen = showExecutionProgress;
  const showLoadingOverlay = !showProgressScreen && (isAnalyzing || isExecuting);

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
            title="Execution Error"
            color="background-error"
          >
            {executionError}
          </Alert>
        )}

        {!viewingResults && (
          <ComparisonConfigScreen
            tabId={tabId}
            config={comparisonConfig}
            schemaComparison={schemaComparison}
            onConfigChange={handleConfigChange}
            onAnalyzeSchemas={analyzeSchemas}
            isAnalyzing={isAnalyzing}
            onRun={handleExecuteComparison}
            canRun={canRun}
            isRunning={isExecuting}
            scrollContainerRef={scrollContainerRef}
          />
        )}

        {viewingResults &&
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
              onResultsLoaded={handleResultsLoaded}
            />
          )}
      </Stack>

      {showProgressScreen && (
        <div
          className="absolute inset-0 z-[5] flex items-center justify-center px-6"
          style={{
            backgroundColor:
              colorScheme === 'dark' ? 'rgba(16, 18, 25, 0.88)' : 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <ComparisonExecutionProgress />
        </div>
      )}
    </div>
  );
});

ComparisonTabView.displayName = 'ComparisonTabView';
