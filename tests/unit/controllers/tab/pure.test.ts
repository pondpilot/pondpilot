import { createDefaultDataViewStateCache, updateDataViewStateCache } from '@controllers/tab/pure';
import { describe, it, expect } from '@jest/globals';
import { TabDataViewStateCache } from '@models/tab';

describe('pure tab controller functions', () => {
  describe('createDefaultDataViewStateCache', () => {
    it('should return a cache with all fields set to null', () => {
      const cache = createDefaultDataViewStateCache();

      expect(cache).toEqual({
        dataViewPage: null,
        tableColumnSizes: null,
        sort: null,
        staleData: null,
        viewMode: null,
        chartConfig: null,
      });
    });

    it('should return a new object each time', () => {
      const cache1 = createDefaultDataViewStateCache();
      const cache2 = createDefaultDataViewStateCache();

      expect(cache1).not.toBe(cache2);
      expect(cache1).toEqual(cache2);
    });
  });

  describe('updateDataViewStateCache', () => {
    it('should create a new cache with defaults when current cache is null', () => {
      const result = updateDataViewStateCache(null, { viewMode: 'chart' });

      expect(result).toEqual({
        dataViewPage: null,
        tableColumnSizes: null,
        sort: null,
        staleData: null,
        viewMode: 'chart',
        chartConfig: null,
      });
    });

    it('should merge updates with existing cache', () => {
      const currentCache: TabDataViewStateCache = {
        dataViewPage: 5,
        tableColumnSizes: { col1: 100 },
        sort: null,
        staleData: null,
        viewMode: 'table',
        chartConfig: null,
      };

      const result = updateDataViewStateCache(currentCache, { viewMode: 'chart' });

      expect(result).toEqual({
        dataViewPage: 5,
        tableColumnSizes: { col1: 100 },
        sort: null,
        staleData: null,
        viewMode: 'chart',
        chartConfig: null,
      });
    });

    it('should not mutate the original cache', () => {
      const currentCache: TabDataViewStateCache = {
        dataViewPage: 5,
        tableColumnSizes: null,
        sort: null,
        staleData: null,
        viewMode: 'table',
        chartConfig: null,
      };

      updateDataViewStateCache(currentCache, { viewMode: 'chart' });

      expect(currentCache.viewMode).toBe('table');
    });

    it('should handle multiple field updates', () => {
      const result = updateDataViewStateCache(null, {
        viewMode: 'chart',
        dataViewPage: 3,
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
      });

      expect(result.viewMode).toBe('chart');
      expect(result.dataViewPage).toBe(3);
      expect(result.chartConfig).toEqual({
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
      });
    });

    it('should handle empty updates', () => {
      const currentCache: TabDataViewStateCache = {
        dataViewPage: 5,
        tableColumnSizes: null,
        sort: null,
        staleData: null,
        viewMode: 'table',
        chartConfig: null,
      };

      const result = updateDataViewStateCache(currentCache, {});

      expect(result).toEqual(currentCache);
      expect(result).not.toBe(currentCache);
    });
  });
});
