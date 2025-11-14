import { Comparison } from '@models/comparison';
import { ComparisonTab, TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { useMemo } from 'react';

/**
 * Hook to get both the comparison tab and the comparison data.
 * Returns null if the tab is not found or is not a comparison tab.
 */
export function useComparison(tabId: TabId): {
  tab: ComparisonTab;
  comparison: Comparison;
} | null {
  const tab = useAppStore((state) => state.tabs.get(tabId));
  const comparison = useAppStore((state) =>
    tab && tab.type === 'comparison' ? state.comparisons.get(tab.comparisonId) : undefined,
  );

  return useMemo(() => {
    if (!tab || tab.type !== 'comparison' || !comparison) {
      return null;
    }

    return { tab, comparison };
  }, [tab, comparison]);
}
