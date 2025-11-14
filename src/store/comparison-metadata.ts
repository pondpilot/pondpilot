import type {
  Comparison,
  ComparisonExecutionMetadata,
  ComparisonId,
  ComparisonSourceStat,
  ComparisonSourceStats,
} from '@models/comparison';

import { useAppStore } from './app-store';

const ensureMetadata = (metadata: Comparison['metadata'] | undefined) =>
  metadata ?? { sourceStats: null, partialResults: false, executionMetadata: null };

type SourceStatsUpdate = {
  sourceA?: ComparisonSourceStat | null;
  sourceB?: ComparisonSourceStat | null;
};

const updateComparisonMetadataInternal = (
  comparisonId: ComparisonId,
  updater: (metadata: Comparison['metadata']) => Comparison['metadata'],
  action: string,
): void => {
  useAppStore.setState(
    (state) => {
      const comparisons = new Map(state.comparisons);
      const comparison = comparisons.get(comparisonId);
      if (!comparison) {
        return state;
      }

      const nextMetadata = updater(ensureMetadata(comparison.metadata));
      const updatedComparison: Comparison = {
        ...comparison,
        metadata: nextMetadata,
      };

      comparisons.set(comparisonId, updatedComparison);
      return { comparisons };
    },
    undefined,
    action,
  );
};

export const setComparisonSourceStats = (
  comparisonId: ComparisonId,
  update: SourceStatsUpdate,
): void => {
  const hasData = update.sourceA !== undefined || update.sourceB !== undefined;
  if (!hasData) {
    return;
  }

  updateComparisonMetadataInternal(
    comparisonId,
    (metadata) => {
      const existing = metadata.sourceStats ?? { sourceA: null, sourceB: null };
      return {
        ...metadata,
        sourceStats: {
          sourceA: update.sourceA !== undefined ? update.sourceA : existing.sourceA,
          sourceB: update.sourceB !== undefined ? update.sourceB : existing.sourceB,
        },
      };
    },
    'AppStore/setComparisonSourceStats',
  );
};

export const setComparisonPartialResults = (comparisonId: ComparisonId, partial: boolean): void => {
  updateComparisonMetadataInternal(
    comparisonId,
    (metadata) => ({ ...metadata, partialResults: partial }),
    'AppStore/setComparisonPartialResults',
  );
};

export const getComparisonSourceStats = (
  comparisonId: ComparisonId,
): ComparisonSourceStats | null => {
  const { comparisons } = useAppStore.getState();
  const comparison = comparisons.get(comparisonId);
  if (!comparison) {
    return null;
  }
  return ensureMetadata(comparison.metadata).sourceStats;
};

export const getComparisonPartialResults = (comparisonId: ComparisonId): boolean => {
  const { comparisons } = useAppStore.getState();
  const comparison = comparisons.get(comparisonId);
  if (!comparison) {
    return false;
  }
  return ensureMetadata(comparison.metadata).partialResults;
};

export const setComparisonExecutionMetadata = (
  comparisonId: ComparisonId,
  executionMetadata: ComparisonExecutionMetadata | null,
): void => {
  updateComparisonMetadataInternal(
    comparisonId,
    (metadata) => ({ ...metadata, executionMetadata }),
    'AppStore/setComparisonExecutionMetadata',
  );
};

export const getComparisonExecutionMetadata = (
  comparisonId: ComparisonId,
): ComparisonExecutionMetadata | null => {
  const { comparisons } = useAppStore.getState();
  const comparison = comparisons.get(comparisonId);
  if (!comparison) {
    return null;
  }
  return ensureMetadata(comparison.metadata).executionMetadata;
};
