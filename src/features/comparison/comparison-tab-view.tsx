import {
  updateComparisonWizardStep,
  updateSchemaComparison,
  setComparisonConfig,
  updateComparisonConfig,
  setComparisonExecutionTime,
} from '@controllers/tab/comparison-tab-controller';
import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { Stack, Stepper, LoadingOverlay, Alert } from '@mantine/core';
import { ComparisonTab, TabId, ComparisonSource, ComparisonConfig } from '@models/tab';
import { useTabReactiveState } from '@store/app-store';
import { IconAlertCircle } from '@tabler/icons-react';
import { memo, useState, useCallback } from 'react';

import { ComparisonViewer } from './components/comparison-results/comparison-viewer';
import { ConfigurationStep } from './components/comparison-wizard/configuration-step';
import { SchemaAnalysisStep } from './components/comparison-wizard/schema-analysis-step';
import { SourceSelectionStep } from './components/comparison-wizard/source-selection-step';
import { WizardNavigation } from './components/comparison-wizard/wizard-navigation';
import { useComparisonExecution } from './hooks/use-comparison-execution';
import { useSchemaAnalysis } from './hooks/use-schema-analysis';

interface ComparisonTabViewProps {
  tabId: TabId;
  active: boolean;
}

const wizardStepToIndex = (step: ComparisonTab['wizardStep']): number => {
  switch (step) {
    case 'select-sources':
      return 0;
    case 'analyze-schema':
      return 1;
    case 'configure':
      return 2;
    case 'results':
      return 3;
    default:
      return 0;
  }
};

export const ComparisonTabView = memo(({ tabId, active }: ComparisonTabViewProps) => {
  const tab = useTabReactiveState<ComparisonTab>(tabId, 'comparison');
  const pool = useInitializedDuckDBConnectionPool();
  const { analyzeSchemas, isAnalyzing, error: analysisError } = useSchemaAnalysis(pool);
  const { executeComparison, isExecuting, error: executionError } =
    useComparisonExecution(pool);

  const [sourceA, setSourceA] = useState<ComparisonSource | null>(null);
  const [sourceB, setSourceB] = useState<ComparisonSource | null>(null);

  const currentStep = wizardStepToIndex(tab.wizardStep);
  const canProceedFromSourceSelection = sourceA !== null && sourceB !== null;

  const handleNextFromSourceSelection = useCallback(async () => {
    if (!sourceA || !sourceB) return;

    updateComparisonWizardStep(tabId, 'analyze-schema');

    const result = await analyzeSchemas(sourceA, sourceB);

    if (result) {
      updateSchemaComparison(tabId, result);
    }
  }, [tabId, sourceA, sourceB, analyzeSchemas]);

  const handleNextFromSchemaAnalysis = useCallback(() => {
    if (!sourceA || !sourceB || !tab.schemaComparison) return;

    const config: ComparisonConfig = {
      sourceA,
      sourceB,
      joinColumns: tab.schemaComparison.suggestedKeys,
      filterA: null,
      filterB: null,
      compareColumns: null,
      showOnlyDifferences: false,
      showSchemaOnlyColumns: false,
      compareMode: 'strict',
    };

    setComparisonConfig(tabId, config);
    updateComparisonWizardStep(tabId, 'configure');
  }, [tabId, sourceA, sourceB, tab.schemaComparison]);

  const handleBackToSourceSelection = useCallback(() => {
    updateComparisonWizardStep(tabId, 'select-sources');
  }, [tabId]);

  const handleBackToSchemaAnalysis = useCallback(() => {
    updateComparisonWizardStep(tabId, 'analyze-schema');
  }, [tabId]);

  const handleBackToConfiguration = useCallback(() => {
    updateComparisonWizardStep(tabId, 'configure');
  }, [tabId]);

  const handleRefreshComparison = useCallback(async () => {
    if (!tab.config || !tab.schemaComparison) return;

    const result = await executeComparison(tab.config, tab.schemaComparison);

    if (result) {
      setComparisonExecutionTime(tabId, Date.now());
    }
  }, [tabId, tab.config, tab.schemaComparison, executeComparison]);

  const handleConfigChange = useCallback(
    (configChanges: Partial<ComparisonConfig>) => {
      updateComparisonConfig(tabId, configChanges);
    },
    [tabId],
  );

  const handleExecuteComparison = useCallback(async () => {
    if (!tab.config || !tab.schemaComparison) return;

    const result = await executeComparison(tab.config, tab.schemaComparison);

    if (result) {
      setComparisonExecutionTime(tabId, Date.now());
      updateComparisonWizardStep(tabId, 'results');
    }
  }, [tabId, tab.config, tab.schemaComparison, executeComparison]);

  if (!active) {
    return null;
  }

  return (
    <div className="h-full py-6 px-6 overflow-auto relative">
      <LoadingOverlay visible={isAnalyzing || isExecuting} overlayProps={{ blur: 2 }} />

      <Stack gap="xl">
        {/* Hide wizard stepper when viewing results */}
        {tab.wizardStep !== 'results' && (
          <Stepper active={currentStep} size="sm">
            <Stepper.Step label="Select Sources" description="Choose data sources" />
            <Stepper.Step label="Analyze Schema" description="Review differences" />
            <Stepper.Step label="Configure" description="Set join keys & filters" />
            <Stepper.Step label="Compare" description="View results" />
          </Stepper>
        )}

        {analysisError && (
          <Alert icon={<IconAlertCircle size={16} />} title="Analysis Error" color="red">
            {analysisError}
          </Alert>
        )}

        {executionError && (
          <Alert icon={<IconAlertCircle size={16} />} title="Execution Error" color="red">
            {executionError}
          </Alert>
        )}

        {tab.wizardStep === 'select-sources' && (
          <>
            <SourceSelectionStep onSourceAChange={setSourceA} onSourceBChange={setSourceB} />
            <WizardNavigation
              onNext={handleNextFromSourceSelection}
              nextLabel="Analyze Schemas"
              nextDisabled={!canProceedFromSourceSelection}
              showBack={false}
            />
          </>
        )}

        {tab.wizardStep === 'analyze-schema' && (
          <>
            <SchemaAnalysisStep tab={tab} />
            <WizardNavigation
              onNext={handleNextFromSchemaAnalysis}
              onBack={handleBackToSourceSelection}
              nextLabel="Configure Comparison"
              nextDisabled={
                !tab.schemaComparison || tab.schemaComparison.commonColumns.length === 0
              }
            />
          </>
        )}

        {tab.wizardStep === 'configure' && (
          <>
            <ConfigurationStep tab={tab} onConfigChange={handleConfigChange} />
            <WizardNavigation
              onNext={handleExecuteComparison}
              onBack={handleBackToSchemaAnalysis}
              nextLabel="Run Comparison"
              nextDisabled={!tab.config || tab.config.joinColumns.length === 0}
            />
          </>
        )}

        {tab.wizardStep === 'results' &&
          tab.config &&
          tab.schemaComparison &&
          tab.lastExecutionTime && (
            <ComparisonViewer
              tabId={tabId}
              config={tab.config}
              schemaComparison={tab.schemaComparison}
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
