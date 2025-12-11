import {
  isTemporalType,
  isCategoricalType,
  getXAxisCandidates,
  getYAxisCandidates,
  getGroupByCandidates,
  suggestChartColumns,
} from '@features/chart-view/utils/column-suggestions';
import { describe, it, expect } from '@jest/globals';
import { DBColumn, DBColumnId, NormalizedSQLType } from '@models/db';

// Helper to create a mock column
const createColumn = (name: string, sqlType: NormalizedSQLType): DBColumn => ({
  id: name.toLowerCase().replace(/\s+/g, '_') as unknown as DBColumnId,
  name,
  sqlType,
  nullable: true,
  databaseType: sqlType,
  columnIndex: 0,
});

// Note: Number types in this codebase are: 'integer', 'bigint', 'float', 'decimal'
// NOT 'int' which is not a valid NormalizedSQLType

describe('chart column suggestions', () => {
  describe('isTemporalType', () => {
    it('should return true for date types', () => {
      expect(isTemporalType('date')).toBe(true);
      expect(isTemporalType('timestamp')).toBe(true);
      expect(isTemporalType('timestamptz')).toBe(true);
      expect(isTemporalType('time')).toBe(true);
      expect(isTemporalType('timetz')).toBe(true);
    });

    it('should return false for non-temporal types', () => {
      expect(isTemporalType('string')).toBe(false);
      expect(isTemporalType('integer')).toBe(false);
      expect(isTemporalType('float')).toBe(false);
      expect(isTemporalType('boolean')).toBe(false);
    });
  });

  describe('isCategoricalType', () => {
    it('should return true for categorical types', () => {
      expect(isCategoricalType('string')).toBe(true);
      expect(isCategoricalType('boolean')).toBe(true);
    });

    it('should return false for non-categorical types', () => {
      expect(isCategoricalType('integer')).toBe(false);
      expect(isCategoricalType('float')).toBe(false);
      expect(isCategoricalType('date')).toBe(false);
    });
  });

  describe('getXAxisCandidates', () => {
    it('should return temporal, categorical, and numeric columns', () => {
      const columns = [
        createColumn('created_at', 'timestamp'),
        createColumn('name', 'string'),
        createColumn('count', 'integer'),
        createColumn('blob_data', 'bytes'),
      ];

      const candidates = getXAxisCandidates(columns);

      expect(candidates).toHaveLength(3);
      expect(candidates.map((c) => c.name)).toContain('created_at');
      expect(candidates.map((c) => c.name)).toContain('name');
      expect(candidates.map((c) => c.name)).toContain('count');
    });

    it('should return empty array when no suitable columns exist', () => {
      const columns = [createColumn('blob_data', 'bytes')];

      const candidates = getXAxisCandidates(columns);

      expect(candidates).toHaveLength(0);
    });
  });

  describe('getYAxisCandidates', () => {
    it('should return only numeric columns', () => {
      const columns = [
        createColumn('name', 'string'),
        createColumn('count', 'integer'),
        createColumn('price', 'float'),
        createColumn('created_at', 'timestamp'),
      ];

      const candidates = getYAxisCandidates(columns);

      expect(candidates).toHaveLength(2);
      expect(candidates.map((c) => c.name)).toContain('count');
      expect(candidates.map((c) => c.name)).toContain('price');
    });

    it('should return empty array when no numeric columns exist', () => {
      const columns = [createColumn('name', 'string'), createColumn('created_at', 'timestamp')];

      const candidates = getYAxisCandidates(columns);

      expect(candidates).toHaveLength(0);
    });
  });

  describe('getGroupByCandidates', () => {
    it('should return only categorical columns', () => {
      const columns = [
        createColumn('category', 'string'),
        createColumn('is_active', 'boolean'),
        createColumn('count', 'integer'),
        createColumn('created_at', 'timestamp'),
      ];

      const candidates = getGroupByCandidates(columns);

      expect(candidates).toHaveLength(2);
      expect(candidates.map((c) => c.name)).toContain('category');
      expect(candidates.map((c) => c.name)).toContain('is_active');
    });
  });

  describe('suggestChartColumns', () => {
    it('should prefer temporal columns for X-axis', () => {
      const columns = [
        createColumn('name', 'string'),
        createColumn('created_at', 'timestamp'),
        createColumn('value', 'integer'),
      ];

      const suggestion = suggestChartColumns(columns);

      expect(suggestion.xAxisColumn).toBe('created_at');
      expect(suggestion.yAxisColumn).toBe('value');
    });

    it('should fall back to categorical columns for X-axis if no temporal', () => {
      const columns = [createColumn('category', 'string'), createColumn('value', 'integer')];

      const suggestion = suggestChartColumns(columns);

      expect(suggestion.xAxisColumn).toBe('category');
      expect(suggestion.yAxisColumn).toBe('value');
    });

    it('should fall back to numeric columns for X-axis if no temporal or categorical', () => {
      const columns = [createColumn('id', 'integer'), createColumn('value', 'float')];

      const suggestion = suggestChartColumns(columns);

      // Both are numeric, so first one is X, second is Y
      expect(suggestion.xAxisColumn).toBe('id');
      expect(suggestion.yAxisColumn).toBe('value');
    });

    it('should suggest groupBy column when extra categorical columns exist', () => {
      const columns = [
        createColumn('date', 'timestamp'),
        createColumn('category', 'string'),
        createColumn('value', 'integer'),
      ];

      const suggestion = suggestChartColumns(columns);

      expect(suggestion.xAxisColumn).toBe('date');
      expect(suggestion.yAxisColumn).toBe('value');
      expect(suggestion.groupByColumn).toBe('category');
    });

    it('should not suggest same column for X-axis and groupBy', () => {
      const columns = [createColumn('category', 'string'), createColumn('value', 'integer')];

      const suggestion = suggestChartColumns(columns);

      expect(suggestion.xAxisColumn).toBe('category');
      expect(suggestion.groupByColumn).toBe(null);
    });

    it('should return null values when no suitable columns exist', () => {
      const columns: DBColumn[] = [];

      const suggestion = suggestChartColumns(columns);

      expect(suggestion.xAxisColumn).toBe(null);
      expect(suggestion.yAxisColumn).toBe(null);
      expect(suggestion.groupByColumn).toBe(null);
    });

    it('should handle case with only one numeric column', () => {
      const columns = [createColumn('value', 'integer')];

      const suggestion = suggestChartColumns(columns);

      expect(suggestion.xAxisColumn).toBe('value');
      expect(suggestion.yAxisColumn).toBe(null);
    });

    it('should handle real-world sales data schema', () => {
      const columns = [
        createColumn('order_date', 'date'),
        createColumn('product_name', 'string'),
        createColumn('category', 'string'),
        createColumn('quantity', 'integer'),
        createColumn('revenue', 'float'),
      ];

      const suggestion = suggestChartColumns(columns);

      expect(suggestion.xAxisColumn).toBe('order_date');
      // Y-axis is first numeric column not used as X
      expect(suggestion.yAxisColumn).toBe('quantity');
      // GroupBy is first categorical not used as X
      expect(suggestion.groupByColumn).toBe('product_name');
    });
  });
});
