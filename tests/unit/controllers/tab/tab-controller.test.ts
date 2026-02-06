/* eslint-disable import/order -- Module-under-test import must come after jest.mock calls for proper mock hoisting */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ChartConfig } from '@models/chart';
import { TabId, ScriptTab, AnyTab } from '@models/tab';

// Mock setup - must be declared before jest.mock calls
let mockSetState: jest.Mock;
let mockTabs: Map<TabId, AnyTab>;

jest.mock('@store/app-store', () => {
  mockSetState = jest.fn();
  mockTabs = new Map();
  return {
    useAppStore: {
      getState: () => ({
        tabs: mockTabs,
        _iDbConn: null,
      }),
      setState: mockSetState,
    },
  };
});

// Mock ensureTab utility
jest.mock('@utils/tab', () => ({
  ensureTab: jest.fn((tabId: TabId, tabs: Map<TabId, AnyTab>) => tabs.get(tabId)),
  makeTabId: jest.fn(() => 'test-tab-id' as TabId),
}));

// eslint-disable-next-line import/first -- Module-under-test import must come after jest.mock calls
import { updateTabViewMode, updateTabChartConfig } from '@controllers/tab/tab-controller';

describe('tab-controller', () => {
  const testTabId = 'test-tab-123' as TabId;

  beforeEach(() => {
    mockTabs.clear();
    mockSetState.mockClear();
  });

  describe('updateTabViewMode', () => {
    it('should do nothing if tab does not exist', () => {
      updateTabViewMode(testTabId, 'chart');

      expect(mockSetState).not.toHaveBeenCalled();
    });

    it('should do nothing if viewMode is already the same', () => {
      const existingTab: ScriptTab = {
        type: 'script',
        id: testTabId,
        sqlScriptId: 'script-1' as any,
        dataViewPaneHeight: 300,
        editorPaneHeight: 500,
        lastExecutedQuery: null,
        dataViewStateCache: {
          dataViewPage: null,
          tableColumnSizes: null,
          sort: null,
          staleData: null,
          viewMode: 'chart',
          chartConfig: null,
        },
      };
      mockTabs.set(testTabId, existingTab);

      updateTabViewMode(testTabId, 'chart');

      expect(mockSetState).not.toHaveBeenCalled();
    });

    it('should update viewMode when different', () => {
      const existingTab: ScriptTab = {
        type: 'script',
        id: testTabId,
        sqlScriptId: 'script-1' as any,
        dataViewPaneHeight: 300,
        editorPaneHeight: 500,
        lastExecutedQuery: null,
        dataViewStateCache: {
          dataViewPage: 5,
          tableColumnSizes: null,
          sort: null,
          staleData: null,
          viewMode: 'table',
          chartConfig: null,
        },
      };
      mockTabs.set(testTabId, existingTab);

      updateTabViewMode(testTabId, 'chart');

      expect(mockSetState).toHaveBeenCalledTimes(1);
      const stateUpdate = mockSetState.mock.calls[0][0] as { tabs: Map<TabId, AnyTab> };
      const newTabs = stateUpdate.tabs;
      const updatedTab = newTabs.get(testTabId);

      expect(updatedTab?.dataViewStateCache?.viewMode).toBe('chart');
      expect(updatedTab?.dataViewStateCache?.dataViewPage).toBe(5);
    });

    it('should update viewMode to metadata', () => {
      const existingTab: ScriptTab = {
        type: 'script',
        id: testTabId,
        sqlScriptId: 'script-1' as any,
        dataViewPaneHeight: 300,
        editorPaneHeight: 500,
        lastExecutedQuery: null,
        dataViewStateCache: {
          dataViewPage: 0,
          tableColumnSizes: null,
          sort: null,
          staleData: null,
          viewMode: 'table',
          chartConfig: null,
        },
      };
      mockTabs.set(testTabId, existingTab);

      updateTabViewMode(testTabId, 'metadata');

      expect(mockSetState).toHaveBeenCalledTimes(1);
      const stateUpdate = mockSetState.mock.calls[0][0] as { tabs: Map<TabId, AnyTab> };
      const updatedTab = stateUpdate.tabs.get(testTabId);

      expect(updatedTab?.dataViewStateCache?.viewMode).toBe('metadata');
    });

    it('should create dataViewStateCache if it does not exist', () => {
      const existingTab: ScriptTab = {
        type: 'script',
        id: testTabId,
        sqlScriptId: 'script-1' as any,
        dataViewPaneHeight: 300,
        editorPaneHeight: 500,
        lastExecutedQuery: null,
        dataViewStateCache: null,
      };
      mockTabs.set(testTabId, existingTab);

      updateTabViewMode(testTabId, 'chart');

      expect(mockSetState).toHaveBeenCalledTimes(1);
      const stateUpdate = mockSetState.mock.calls[0][0] as { tabs: Map<TabId, AnyTab> };
      const newTabs = stateUpdate.tabs;
      const updatedTab = newTabs.get(testTabId);

      expect(updatedTab?.dataViewStateCache).toEqual({
        dataViewPage: null,
        tableColumnSizes: null,
        sort: null,
        staleData: null,
        viewMode: 'chart',
        chartConfig: null,
      });
    });
  });

  describe('updateTabChartConfig', () => {
    it('should do nothing if tab does not exist', () => {
      updateTabChartConfig(testTabId, { chartType: 'line' });

      expect(mockSetState).not.toHaveBeenCalled();
    });

    it('should do nothing if chartConfig is unchanged', () => {
      const chartConfig: ChartConfig = {
        chartType: 'bar',
        xAxisColumn: 'date',
        yAxisColumn: 'value',
        groupByColumn: null,
        aggregation: 'sum',
        sortBy: 'x',
        sortOrder: 'none',
        title: null,
        xAxisLabel: null,
        yAxisLabel: null,
        colorScheme: 'default',
        additionalYColumns: [],
      };
      const existingTab: ScriptTab = {
        type: 'script',
        id: testTabId,
        sqlScriptId: 'script-1' as any,
        dataViewPaneHeight: 300,
        editorPaneHeight: 500,
        lastExecutedQuery: null,
        dataViewStateCache: {
          dataViewPage: null,
          tableColumnSizes: null,
          sort: null,
          staleData: null,
          viewMode: 'chart',
          chartConfig,
        },
      };
      mockTabs.set(testTabId, existingTab);

      // Pass the same config
      updateTabChartConfig(testTabId, chartConfig);

      expect(mockSetState).not.toHaveBeenCalled();
    });

    it('should update chartConfig when different', () => {
      const existingTab: ScriptTab = {
        type: 'script',
        id: testTabId,
        sqlScriptId: 'script-1' as any,
        dataViewPaneHeight: 300,
        editorPaneHeight: 500,
        lastExecutedQuery: null,
        dataViewStateCache: {
          dataViewPage: null,
          tableColumnSizes: null,
          sort: null,
          staleData: null,
          viewMode: 'chart',
          chartConfig: {
            chartType: 'bar',
            xAxisColumn: 'date',
            yAxisColumn: 'value',
            groupByColumn: null,
            aggregation: 'sum',
            sortBy: 'x',
            sortOrder: 'none',
            title: null,
            xAxisLabel: null,
            yAxisLabel: null,
            colorScheme: 'default',
            additionalYColumns: [],
          },
        },
      };
      mockTabs.set(testTabId, existingTab);

      updateTabChartConfig(testTabId, { chartType: 'line' });

      expect(mockSetState).toHaveBeenCalledTimes(1);
      const [[stateUpdate]] = mockSetState.mock.calls;
      const newTabs = (stateUpdate as { tabs: Map<TabId, AnyTab> }).tabs;
      const updatedTab = newTabs.get(testTabId);

      expect(updatedTab?.dataViewStateCache?.chartConfig).toEqual({
        chartType: 'line',
        xAxisColumn: 'date',
        yAxisColumn: 'value',
        groupByColumn: null,
        aggregation: 'sum',
        sortBy: 'x',
        sortOrder: 'none',
        title: null,
        xAxisLabel: null,
        yAxisLabel: null,
        colorScheme: 'default',
        additionalYColumns: [],
      });
    });

    it('should merge partial chartConfig updates', () => {
      const existingTab: ScriptTab = {
        type: 'script',
        id: testTabId,
        sqlScriptId: 'script-1' as any,
        dataViewPaneHeight: 300,
        editorPaneHeight: 500,
        lastExecutedQuery: null,
        dataViewStateCache: {
          dataViewPage: null,
          tableColumnSizes: null,
          sort: null,
          staleData: null,
          viewMode: 'chart',
          chartConfig: {
            chartType: 'bar',
            xAxisColumn: 'date',
            yAxisColumn: 'value',
            groupByColumn: 'category',
            aggregation: 'sum',
            sortBy: 'x',
            sortOrder: 'none',
            title: null,
            xAxisLabel: null,
            yAxisLabel: null,
            colorScheme: 'default',
            additionalYColumns: [],
          },
        },
      };
      mockTabs.set(testTabId, existingTab);

      updateTabChartConfig(testTabId, { yAxisColumn: 'count' });

      expect(mockSetState).toHaveBeenCalledTimes(1);
      const [[stateUpdate]] = mockSetState.mock.calls;
      const newTabs = (stateUpdate as { tabs: Map<TabId, AnyTab> }).tabs;
      const updatedTab = newTabs.get(testTabId);

      expect(updatedTab?.dataViewStateCache?.chartConfig).toEqual({
        chartType: 'bar',
        xAxisColumn: 'date',
        yAxisColumn: 'count',
        groupByColumn: 'category',
        aggregation: 'sum',
        sortBy: 'x',
        sortOrder: 'none',
        title: null,
        xAxisLabel: null,
        yAxisLabel: null,
        colorScheme: 'default',
        additionalYColumns: [],
      });
    });

    it('should create dataViewStateCache with chartConfig if cache does not exist', () => {
      const existingTab: ScriptTab = {
        type: 'script',
        id: testTabId,
        sqlScriptId: 'script-1' as any,
        dataViewPaneHeight: 300,
        editorPaneHeight: 500,
        lastExecutedQuery: null,
        dataViewStateCache: null,
      };
      mockTabs.set(testTabId, existingTab);

      updateTabChartConfig(testTabId, {
        chartType: 'line',
        xAxisColumn: 'date',
        yAxisColumn: 'value',
      });

      expect(mockSetState).toHaveBeenCalledTimes(1);
      const [[stateUpdate]] = mockSetState.mock.calls;
      const newTabs = (stateUpdate as { tabs: Map<TabId, AnyTab> }).tabs;
      const updatedTab = newTabs.get(testTabId);

      expect(updatedTab?.dataViewStateCache?.chartConfig).toEqual({
        chartType: 'line',
        xAxisColumn: 'date',
        yAxisColumn: 'value',
        groupByColumn: null,
        aggregation: 'sum',
        sortBy: 'x',
        sortOrder: 'none',
        title: null,
        xAxisLabel: null,
        yAxisLabel: null,
        colorScheme: 'default',
        additionalYColumns: [],
      });
    });

    it('should use default values when chartConfig is null and partial update is provided', () => {
      const existingTab: ScriptTab = {
        type: 'script',
        id: testTabId,
        sqlScriptId: 'script-1' as any,
        dataViewPaneHeight: 300,
        editorPaneHeight: 500,
        lastExecutedQuery: null,
        dataViewStateCache: {
          dataViewPage: null,
          tableColumnSizes: null,
          sort: null,
          staleData: null,
          viewMode: 'chart',
          chartConfig: null,
        },
      };
      mockTabs.set(testTabId, existingTab);

      updateTabChartConfig(testTabId, { xAxisColumn: 'date' });

      expect(mockSetState).toHaveBeenCalledTimes(1);
      const [[stateUpdate]] = mockSetState.mock.calls;
      const newTabs = (stateUpdate as { tabs: Map<TabId, AnyTab> }).tabs;
      const updatedTab = newTabs.get(testTabId);

      expect(updatedTab?.dataViewStateCache?.chartConfig).toEqual({
        chartType: 'bar',
        xAxisColumn: 'date',
        yAxisColumn: null,
        groupByColumn: null,
        aggregation: 'sum',
        sortBy: 'x',
        sortOrder: 'none',
        title: null,
        xAxisLabel: null,
        yAxisLabel: null,
        colorScheme: 'default',
        additionalYColumns: [],
      });
    });

    it('should update additionalYColumns for small multiples', () => {
      const existingTab: ScriptTab = {
        type: 'script',
        id: testTabId,
        sqlScriptId: 'script-1' as any,
        dataViewPaneHeight: 300,
        editorPaneHeight: 500,
        lastExecutedQuery: null,
        dataViewStateCache: {
          dataViewPage: null,
          tableColumnSizes: null,
          sort: null,
          staleData: null,
          viewMode: 'chart',
          chartConfig: {
            chartType: 'bar',
            xAxisColumn: 'date',
            yAxisColumn: 'value',
            groupByColumn: null,
            aggregation: 'sum',
            sortBy: 'x',
            sortOrder: 'none',
            title: null,
            xAxisLabel: null,
            yAxisLabel: null,
            colorScheme: 'default',
            additionalYColumns: [],
          },
        },
      };
      mockTabs.set(testTabId, existingTab);

      updateTabChartConfig(testTabId, { additionalYColumns: ['count', 'total'] });

      expect(mockSetState).toHaveBeenCalledTimes(1);
      const [[stateUpdate]] = mockSetState.mock.calls;
      const newTabs = (stateUpdate as { tabs: Map<TabId, AnyTab> }).tabs;
      const updatedTab = newTabs.get(testTabId);

      expect(updatedTab?.dataViewStateCache?.chartConfig?.additionalYColumns).toEqual([
        'count',
        'total',
      ]);
    });

    it('should preserve other config when updating additionalYColumns', () => {
      const existingTab: ScriptTab = {
        type: 'script',
        id: testTabId,
        sqlScriptId: 'script-1' as any,
        dataViewPaneHeight: 300,
        editorPaneHeight: 500,
        lastExecutedQuery: null,
        dataViewStateCache: {
          dataViewPage: null,
          tableColumnSizes: null,
          sort: null,
          staleData: null,
          viewMode: 'chart',
          chartConfig: {
            chartType: 'line',
            xAxisColumn: 'date',
            yAxisColumn: 'value',
            groupByColumn: 'category',
            aggregation: 'avg',
            sortBy: 'y',
            sortOrder: 'desc',
            title: 'My Chart',
            xAxisLabel: 'Date',
            yAxisLabel: 'Value',
            colorScheme: 'purple',
            additionalYColumns: ['count'],
          },
        },
      };
      mockTabs.set(testTabId, existingTab);

      updateTabChartConfig(testTabId, { additionalYColumns: ['count', 'total', 'average'] });

      expect(mockSetState).toHaveBeenCalledTimes(1);
      const [[stateUpdate]] = mockSetState.mock.calls;
      const newTabs = (stateUpdate as { tabs: Map<TabId, AnyTab> }).tabs;
      const updatedTab = newTabs.get(testTabId);

      expect(updatedTab?.dataViewStateCache?.chartConfig).toEqual({
        chartType: 'line',
        xAxisColumn: 'date',
        yAxisColumn: 'value',
        groupByColumn: 'category',
        aggregation: 'avg',
        sortBy: 'y',
        sortOrder: 'desc',
        title: 'My Chart',
        xAxisLabel: 'Date',
        yAxisLabel: 'Value',
        colorScheme: 'purple',
        additionalYColumns: ['count', 'total', 'average'],
      });
    });

    it('should clear additionalYColumns when set to empty array', () => {
      const existingTab: ScriptTab = {
        type: 'script',
        id: testTabId,
        sqlScriptId: 'script-1' as any,
        dataViewPaneHeight: 300,
        editorPaneHeight: 500,
        lastExecutedQuery: null,
        dataViewStateCache: {
          dataViewPage: null,
          tableColumnSizes: null,
          sort: null,
          staleData: null,
          viewMode: 'chart',
          chartConfig: {
            chartType: 'bar',
            xAxisColumn: 'date',
            yAxisColumn: 'value',
            groupByColumn: null,
            aggregation: 'sum',
            sortBy: 'x',
            sortOrder: 'none',
            title: null,
            xAxisLabel: null,
            yAxisLabel: null,
            colorScheme: 'default',
            additionalYColumns: ['count', 'total'],
          },
        },
      };
      mockTabs.set(testTabId, existingTab);

      updateTabChartConfig(testTabId, { additionalYColumns: [] });

      expect(mockSetState).toHaveBeenCalledTimes(1);
      const [[stateUpdate]] = mockSetState.mock.calls;
      const newTabs = (stateUpdate as { tabs: Map<TabId, AnyTab> }).tabs;
      const updatedTab = newTabs.get(testTabId);

      expect(updatedTab?.dataViewStateCache?.chartConfig?.additionalYColumns).toEqual([]);
    });
  });
});
