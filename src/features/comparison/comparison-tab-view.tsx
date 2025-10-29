import {
  setComparisonViewingResults,
  updateComparisonConfig,
  setComparisonExecutionTime,
  setComparisonResultsTable,
} from '@controllers/tab/comparison-tab-controller';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { Stack, LoadingOverlay, Alert } from '@mantine/core';
import { ComparisonTab, TabId, ComparisonConfig } from '@models/tab';
import { useTabReactiveState } from '@store/app-store';
import { IconAlertCircle } from '@tabler/icons-react';
import { memo, useCallback, useRef } from 'react';

import { ComparisonConfigScreen } from './components/comparison-config-screen';
import { ComparisonViewer } from './components/comparison-results/comparison-viewer';
import { ICON_CLASSES } from './constants/color-classes';
import { useComparisonExecution } from './hooks/use-comparison-execution';
import { useSchemaAnalysis } from './hooks/use-schema-analysis';

interface ComparisonTabViewProps {
  tabId: TabId;
  active: boolean;
}

export const ComparisonTabView = memo(({ tabId, active }: ComparisonTabViewProps) => {
  const tab = useTabReactiveState<ComparisonTab>(tabId, 'comparison');
  const pool = useInitializedDuckDBConnectionPool();
  const { analyzeSchemas, isAnalyzing, error: analysisError } = useSchemaAnalysis(pool);
  const { executeComparison, isExecuting, error: executionError } = useComparisonExecution(pool);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleConfigChange = useCallback(
    (configChanges: Partial<ComparisonConfig>) => {
      updateComparisonConfig(tabId, configChanges);
    },
    [tabId],
  );

  const handleBackToConfiguration = useCallback(() => {
    setComparisonViewingResults(tabId, false);
  }, [tabId]);

  const handleRefreshComparison = useCallback(async () => {
    if (!tab.config || !tab.schemaComparison) return;

    const executionResult = await executeComparison(tabId, tab.config, tab.schemaComparison);

    if (executionResult) {
      setComparisonExecutionTime(tabId, executionResult.durationSeconds);
      setComparisonResultsTable(tabId, executionResult.tableName);
    }
  }, [tabId, tab.config, tab.schemaComparison, executeComparison]);

  const handleExecuteComparison = useCallback(async () => {
    if (!tab.config || !tab.schemaComparison) return;

    const executionResult = await executeComparison(tabId, tab.config, tab.schemaComparison);

    if (executionResult) {
      setComparisonExecutionTime(tabId, executionResult.durationSeconds);
      setComparisonResultsTable(tabId, executionResult.tableName);
      setComparisonViewingResults(tabId, true);
    }
  }, [tabId, tab.config, tab.schemaComparison, executeComparison]);

  // Compute canRun for the header
  const canRun =
    !!tab.config?.sourceA &&
    !!tab.config?.sourceB &&
    !!tab.schemaComparison &&
    (tab.config?.joinColumns || []).length > 0;

  if (!active) {
    return null;
  }

  return (
    <div ref={scrollContainerRef} className="h-full overflow-auto relative">
      <LoadingOverlay visible={isAnalyzing || isExecuting} overlayProps={{ blur: 2 }} />

      <Stack gap="xl" p={tab.viewingResults ? 'xl' : 0}>
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

        {!tab.viewingResults && (
          <ComparisonConfigScreen
            tabId={tabId}
            config={tab.config}
            schemaComparison={tab.schemaComparison}
            onConfigChange={handleConfigChange}
            onAnalyzeSchemas={analyzeSchemas}
            isAnalyzing={isAnalyzing}
            onRun={handleExecuteComparison}
            canRun={canRun}
            isRunning={isExecuting}
            scrollContainerRef={scrollContainerRef}
          />
        )}

        {tab.viewingResults &&
          tab.config &&
          tab.schemaComparison &&
          tab.comparisonResultsTable &&
          tab.lastExecutionTime && (
            <ComparisonViewer
              tabId={tabId}
              config={tab.config}
              schemaComparison={tab.schemaComparison}
              tableName={tab.comparisonResultsTable}
              executionTime={tab.lastExecutionTime}
              onReconfigure={handleBackToConfiguration}
              onRefresh={handleRefreshComparison}
            />
          )}
      </Stack>
    </div>
  );
});

ComparisonTabView.displayName = 'ComparisonTabView';
