import { spotlight } from '@mantine/spotlight';
import { AnyDataSource } from '@models/data-source';
import { ComparisonSource } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { useCallback, useState } from 'react';

import { dataSourceToComparisonSource } from '../utils/source-selection';

/**
 * Type to track which source (A or B) is being selected
 */
type SourceTarget = 'A' | 'B' | null;

/**
 * Callback function type for handling source selection from spotlight
 */
export type SourceSelectionCallback = (
  dataSource: AnyDataSource,
  schemaName?: string,
  tableName?: string,
) => void;

/**
 * Hook for managing comparison source selection via spotlight
 *
 * This hook provides:
 * - Functions to initiate source selection for A or B
 * - A callback that can be used by spotlight to handle selections
 * - Current selected sources A and B
 *
 * @param onSourceAChange - Callback when source A is selected
 * @param onSourceBChange - Callback when source B is selected
 * @returns Object with selection functions and current selections
 */
export function useComparisonSourceSelection(
  onSourceAChange: (source: ComparisonSource | null) => void,
  onSourceBChange: (source: ComparisonSource | null) => void,
) {
  // Track which source is being selected
  const [selectionTarget, setSelectionTarget] = useState<SourceTarget>(null);

  // Track the selected sources
  const [selectedSourceA, setSelectedSourceA] = useState<ComparisonSource | null>(null);
  const [selectedSourceB, setSelectedSourceB] = useState<ComparisonSource | null>(null);

  /**
   * Function to initiate selection for source A
   */
  const selectSourceA = useCallback(() => {
    setSelectionTarget('A');

    // Create and store the callback immediately (not in useEffect)
    // This ensures it's available when spotlight opens
    const callback = (dataSource: AnyDataSource, schemaName?: string, tableName?: string) => {
      const comparisonSource = dataSourceToComparisonSource(dataSource, schemaName, tableName);

      if (!comparisonSource) {
        return;
      }

      setSelectedSourceA(comparisonSource);
      onSourceAChange(comparisonSource);

      // Clear the selection target and callback
      setSelectionTarget(null);
      useAppStore.setState({ comparisonSourceSelectionCallback: null });
    };

    // Store the callback in app store BEFORE opening spotlight
    useAppStore.setState({
      comparisonSourceSelectionCallback: callback,
      spotlightView: 'dataSources',
    });

    spotlight.open();
  }, [onSourceAChange]);

  /**
   * Function to initiate selection for source B
   */
  const selectSourceB = useCallback(() => {
    setSelectionTarget('B');

    // Create and store the callback immediately (not in useEffect)
    // This ensures it's available when spotlight opens
    const callback = (dataSource: AnyDataSource, schemaName?: string, tableName?: string) => {
      const comparisonSource = dataSourceToComparisonSource(dataSource, schemaName, tableName);

      if (!comparisonSource) {
        return;
      }

      setSelectedSourceB(comparisonSource);
      onSourceBChange(comparisonSource);

      // Clear the selection target and callback
      setSelectionTarget(null);
      useAppStore.setState({ comparisonSourceSelectionCallback: null });
    };

    // Store the callback in app store BEFORE opening spotlight
    useAppStore.setState({
      comparisonSourceSelectionCallback: callback,
      spotlightView: 'dataSources',
    });

    spotlight.open();
  }, [onSourceBChange]);

  return {
    selectSourceA,
    selectSourceB,
    selectedSourceA,
    selectedSourceB,
    isSelectingSource: selectionTarget !== null,
  };
}
