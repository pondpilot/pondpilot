import type { SourceSelectionCallback } from '@features/comparison/hooks/use-comparison-source-selection';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { Comparison, ComparisonId } from '@models/comparison';
import { ComparisonTab, TabId } from '@models/tab';
import {
  clearComparisonResults,
  clearComparisonSourceSelectionCallback,
  deleteComparisons,
  startComparisonSourceSelection,
  useAppStore,
} from '@store/app-store';

const comparison = (id: string, overrides: Partial<Comparison> = {}): Comparison => ({
  id: id as ComparisonId,
  name: id,
  config: null,
  schemaComparison: null,
  lastExecutionTime: null,
  lastRunAt: null,
  resultsTableName: null,
  metadata: {
    sourceStats: null,
    partialResults: false,
    executionMetadata: null,
  },
  ...overrides,
});

const comparisonTab = (
  id: string,
  comparisonId: ComparisonId,
  overrides: Partial<ComparisonTab> = {},
): ComparisonTab => ({
  id: id as TabId,
  type: 'comparison',
  comparisonId,
  viewingResults: false,
  lastExecutionTime: null,
  comparisonResultsTable: null,
  dataViewStateCache: null,
  ...overrides,
});

describe('comparison store actions', () => {
  beforeEach(() => {
    useAppStore.setState({
      comparisons: new Map(),
      tabs: new Map(),
      tabOrder: [],
      activeTabId: null,
      previewTabId: null,
      comparisonSourceSelectionCallback: null,
      spotlightView: 'home',
    });
  });

  it('clears comparison results and cascades result state to comparison tabs', () => {
    const target = comparison('target', {
      resultsTableName: '__pondpilot_comparison_target',
      lastExecutionTime: 12,
      lastRunAt: '2026-07-11T10:00:00.000Z',
    });
    const other = comparison('other', {
      resultsTableName: '__pondpilot_comparison_other',
      lastExecutionTime: 3,
    });
    const targetTab = comparisonTab('target-tab', target.id, {
      viewingResults: true,
      comparisonResultsTable: target.resultsTableName,
      lastExecutionTime: target.lastExecutionTime,
    });
    const secondTargetTab = comparisonTab('second-target-tab', target.id, {
      viewingResults: true,
      comparisonResultsTable: target.resultsTableName,
      lastExecutionTime: target.lastExecutionTime,
    });
    const otherTab = comparisonTab('other-tab', other.id, {
      viewingResults: true,
      comparisonResultsTable: other.resultsTableName,
      lastExecutionTime: other.lastExecutionTime,
    });
    const originalComparisons = new Map([
      [target.id, target],
      [other.id, other],
    ]);
    const originalTabs = new Map([
      [targetTab.id, targetTab],
      [secondTargetTab.id, secondTargetTab],
      [otherTab.id, otherTab],
    ]);

    useAppStore.setState({
      comparisons: originalComparisons,
      tabs: originalTabs,
      tabOrder: [targetTab.id, secondTargetTab.id, otherTab.id],
    });

    const result = clearComparisonResults(target.id);
    const state = useAppStore.getState();

    expect(result).toEqual({
      comparison: {
        ...target,
        resultsTableName: null,
        lastExecutionTime: null,
        lastRunAt: null,
      },
      tabIds: [targetTab.id, secondTargetTab.id],
    });
    expect(state.comparisons).not.toBe(originalComparisons);
    expect(state.tabs).not.toBe(originalTabs);
    expect(state.comparisons.get(target.id)).toMatchObject({
      resultsTableName: null,
      lastExecutionTime: null,
      lastRunAt: null,
    });
    expect(state.tabs.get(targetTab.id)).toMatchObject({
      viewingResults: false,
      comparisonResultsTable: null,
      lastExecutionTime: null,
    });
    expect(state.tabs.get(secondTargetTab.id)).toMatchObject({
      viewingResults: false,
      comparisonResultsTable: null,
      lastExecutionTime: null,
    });
    expect(state.comparisons.get(other.id)).toBe(other);
    expect(state.tabs.get(otherTab.id)).toBe(otherTab);
    expect(originalComparisons.get(target.id)).toBe(target);
    expect(originalTabs.get(targetTab.id)).toBe(targetTab);
  });

  it('deletes comparisons and associated tabs while updating active, preview, and order state', () => {
    const firstComparison = comparison('first');
    const closingComparison = comparison('closing');
    const lastComparison = comparison('last');
    const firstTab = comparisonTab('first-tab', firstComparison.id);
    const closingTab = comparisonTab('closing-tab', closingComparison.id);
    const lastTab = comparisonTab('last-tab', lastComparison.id);
    const originalComparisons = new Map([
      [firstComparison.id, firstComparison],
      [closingComparison.id, closingComparison],
      [lastComparison.id, lastComparison],
    ]);
    const originalTabs = new Map([
      [firstTab.id, firstTab],
      [closingTab.id, closingTab],
      [lastTab.id, lastTab],
    ]);

    useAppStore.setState({
      comparisons: originalComparisons,
      tabs: originalTabs,
      tabOrder: [firstTab.id, closingTab.id, lastTab.id],
      activeTabId: closingTab.id,
      previewTabId: closingTab.id,
    });

    const result = deleteComparisons([closingComparison.id]);
    const state = useAppStore.getState();

    expect(result).toEqual({
      activeTabId: firstTab.id,
      previewTabId: null,
      tabOrder: [firstTab.id, lastTab.id],
      tabIds: [closingTab.id],
    });
    expect(state.comparisons).not.toBe(originalComparisons);
    expect(state.tabs).not.toBe(originalTabs);
    expect(Array.from(state.comparisons.keys())).toEqual([firstComparison.id, lastComparison.id]);
    expect(Array.from(state.tabs.keys())).toEqual([firstTab.id, lastTab.id]);
    expect(state.tabOrder).toEqual([firstTab.id, lastTab.id]);
    expect(state.activeTabId).toBe(firstTab.id);
    expect(state.previewTabId).toBeNull();
    expect(originalComparisons.has(closingComparison.id)).toBe(true);
    expect(originalTabs.has(closingTab.id)).toBe(true);
  });

  it('sets and clears comparison source-selection callback state', () => {
    const callback: SourceSelectionCallback = () => undefined;

    startComparisonSourceSelection(callback);

    expect(useAppStore.getState().comparisonSourceSelectionCallback).toBe(callback);
    expect(useAppStore.getState().spotlightView).toBe('dataSources');

    clearComparisonSourceSelectionCallback();

    expect(useAppStore.getState().comparisonSourceSelectionCallback).toBeNull();
    expect(useAppStore.getState().spotlightView).toBe('dataSources');
  });
});
