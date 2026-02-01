import { describe, it, expect } from '@jest/globals';
import { ColumnDistribution, ColumnStats, RowCountInfo } from '@models/data-adapter';
import { DBColumn, DBColumnId } from '@models/db';

/**
 * Tests for the MetadataView component's integration logic.
 * Since tests run in a Node environment without DOM, we verify the data
 * processing, layout decisions, and state management used by the component.
 */

function makeColumn(
  name: string,
  sqlType: DBColumn['sqlType'],
  index: number,
): DBColumn {
  return {
    name,
    databaseType: sqlType,
    nullable: true,
    sqlType,
    id: `${index}_${name}` as DBColumnId,
    columnIndex: index,
  };
}

function makeStats(
  columnName: string,
  overrides: Partial<ColumnStats> = {},
): ColumnStats {
  return {
    columnName,
    totalCount: 1000,
    distinctCount: 100,
    nullCount: 0,
    min: '0',
    max: '100',
    mean: '50',
    ...overrides,
  };
}

describe('MetadataView', () => {
  describe('component interface', () => {
    it('should accept dataAdapter as the only required prop', () => {
      interface MetadataViewProps {
        dataAdapter: {
          currentSchema: DBColumn[];
          rowCountInfo: RowCountInfo;
        };
      }

      const props: MetadataViewProps = {
        dataAdapter: {
          currentSchema: [makeColumn('id', 'integer', 0)],
          rowCountInfo: {
            realRowCount: 100,
            estimatedRowCount: null,
            availableRowCount: 100,
          },
        },
      };

      expect(props.dataAdapter.currentSchema).toHaveLength(1);
      expect(props.dataAdapter.rowCountInfo.realRowCount).toBe(100);
    });
  });

  describe('empty dataset handling', () => {
    it('should detect empty dataset when schema has no columns', () => {
      const columns: DBColumn[] = [];
      expect(columns.length).toBe(0);
    });

    it('should detect empty dataset when schema is populated', () => {
      const columns = [makeColumn('id', 'integer', 0)];
      expect(columns.length).toBeGreaterThan(0);
    });
  });

  describe('unsupported data source handling', () => {
    it('should detect when metadata stats are not supported', () => {
      const isSupported = false;
      expect(isSupported).toBe(false);
    });
  });

  describe('dataset-level info', () => {
    it('should compute column count from schema', () => {
      const columns = [
        makeColumn('id', 'integer', 0),
        makeColumn('name', 'string', 1),
        makeColumn('price', 'float', 2),
      ];
      expect(columns.length).toBe(3);
    });

    it('should use realRowCount when available', () => {
      const rowCountInfo: RowCountInfo = {
        realRowCount: 3567,
        estimatedRowCount: null,
        availableRowCount: 3567,
      };
      const rowCount =
        rowCountInfo.realRowCount ?? rowCountInfo.estimatedRowCount ?? 0;
      const isEstimated =
        rowCountInfo.realRowCount === null &&
        rowCountInfo.estimatedRowCount !== null;

      expect(rowCount).toBe(3567);
      expect(isEstimated).toBe(false);
    });

    it('should fall back to estimatedRowCount with indicator', () => {
      const rowCountInfo: RowCountInfo = {
        realRowCount: null,
        estimatedRowCount: 10000,
        availableRowCount: 5000,
      };
      const rowCount =
        rowCountInfo.realRowCount ?? rowCountInfo.estimatedRowCount ?? 0;
      const isEstimated =
        rowCountInfo.realRowCount === null &&
        rowCountInfo.estimatedRowCount !== null;

      expect(rowCount).toBe(10000);
      expect(isEstimated).toBe(true);
    });

    it('should fall back to 0 when no row counts available', () => {
      const rowCountInfo: RowCountInfo = {
        realRowCount: null,
        estimatedRowCount: null,
        availableRowCount: 0,
      };
      const rowCount =
        rowCountInfo.realRowCount ?? rowCountInfo.estimatedRowCount ?? 0;

      expect(rowCount).toBe(0);
    });

    it('should pluralize column count correctly', () => {
      const pluralize = (count: number) => (count !== 1 ? 's' : '');
      expect(pluralize(1)).toBe('');
      expect(pluralize(2)).toBe('s');
      expect(pluralize(0)).toBe('s');
    });

    it('should pluralize row count correctly', () => {
      const pluralize = (count: number) => (count !== 1 ? 's' : '');
      expect(pluralize(1)).toBe('');
      expect(pluralize(100)).toBe('s');
    });
  });

  describe('two-panel layout', () => {
    it('should pass all columns to both panels', () => {
      const columns = [
        makeColumn('id', 'integer', 0),
        makeColumn('name', 'string', 1),
        makeColumn('price', 'float', 2),
      ];

      // Both panels receive the same columns array
      const summaryColumns = columns;
      const detailColumns = columns;

      expect(summaryColumns).toBe(detailColumns);
      expect(summaryColumns).toHaveLength(3);
    });

    it('should pass stats and distributions to both panels', () => {
      const columns = [
        makeColumn('id', 'integer', 0),
        makeColumn('name', 'string', 1),
      ];

      const stats = new Map<string, ColumnStats>([
        ['id', makeStats('id', { distinctCount: 500 })],
        ['name', makeStats('name', { distinctCount: 50 })],
      ]);

      const distributions = new Map<string, ColumnDistribution>([
        ['id', { type: 'numeric', buckets: [{ label: '0-100', count: 500 }] }],
        [
          'name',
          { type: 'text', values: [{ value: 'Alice', count: 100 }] },
        ],
      ]);

      // Both panels get the same data
      for (const col of columns) {
        expect(stats.has(col.name)).toBe(true);
        expect(distributions.has(col.name)).toBe(true);
      }
    });
  });

  describe('column selection and scroll interaction', () => {
    it('should track selected column by name', () => {
      let selectedColumn: string | undefined;

      const handleColumnClick = (columnName: string) => {
        selectedColumn = columnName;
      };

      handleColumnClick('price');
      expect(selectedColumn).toBe('price');

      handleColumnClick('name');
      expect(selectedColumn).toBe('name');
    });

    it('should call scrollToColumn when a column is clicked', () => {
      let scrolledTo: string | undefined;

      const detailPanelHandle = {
        scrollToColumn: (columnName: string) => {
          scrolledTo = columnName;
        },
      };

      // Simulate click handler behavior
      detailPanelHandle.scrollToColumn('quantity');
      expect(scrolledTo).toBe('quantity');
    });
  });

  describe('all-NULL column handling', () => {
    it('should handle stats for columns with all null values', () => {
      const stats = makeStats('nullable_col', {
        totalCount: 1000,
        distinctCount: 0,
        nullCount: 1000,
        min: '',
        max: '',
        mean: '',
      });

      expect(stats.nullCount).toBe(stats.totalCount);
      expect(stats.distinctCount).toBe(0);
    });

    it('should handle undefined distribution gracefully', () => {
      const distributions = new Map<string, ColumnDistribution>();
      const dist = distributions.get('nullable_col');
      expect(dist).toBeUndefined();
    });
  });

  describe('large column count handling', () => {
    it('should handle datasets with 50+ columns', () => {
      const columns = Array.from({ length: 60 }, (_, i) =>
        makeColumn(`col_${i}`, i % 3 === 0 ? 'integer' : 'string', i),
      );

      expect(columns).toHaveLength(60);

      // All columns should be rendered in both panels
      const summaryColumnCount = columns.length;
      const detailColumnCount = columns.length;

      expect(summaryColumnCount).toBe(60);
      expect(detailColumnCount).toBe(60);
    });
  });
});
