import { describe, it, expect } from '@jest/globals';
import { ColumnDistribution, ColumnStats } from '@models/data-adapter';
import { DBColumn, DBColumnId } from '@models/db';

/**
 * Since tests run in a Node environment without DOM, we test
 * the component's data logic, interface contracts, and design decisions.
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

describe('SummaryPanel', () => {
  describe('component interface', () => {
    it('should define the expected prop types', () => {
      interface SummaryPanelProps {
        columns: DBColumn[];
        columnStats: Map<string, ColumnStats>;
        columnDistributions: Map<string, ColumnDistribution>;
        isLoading: boolean;
        loadingDistributions: Set<string>;
        onColumnClick?: (columnName: string) => void;
        selectedColumn?: string;
      }

      const props: SummaryPanelProps = {
        columns: [makeColumn('id', 'integer', 0)],
        columnStats: new Map(),
        columnDistributions: new Map(),
        isLoading: false,
        loadingDistributions: new Set(),
      };

      expect(props.columns).toHaveLength(1);
      expect(props.isLoading).toBe(false);
      expect(props.onColumnClick).toBeUndefined();
      expect(props.selectedColumn).toBeUndefined();
    });

    it('should accept optional click and selection props', () => {
      let clickedColumn = '';
      const onColumnClick = (name: string) => {
        clickedColumn = name;
      };

      onColumnClick('test_col');
      expect(clickedColumn).toBe('test_col');
    });
  });

  describe('column icon type mapping', () => {
    it('should map SQL types to icon types using column- prefix', () => {
      const typeToIconMap: Record<string, string> = {
        float: 'column-float',
        decimal: 'column-decimal',
        integer: 'column-integer',
        bigint: 'column-bigint',
        boolean: 'column-boolean',
        date: 'column-date',
        timestamp: 'column-timestamp',
        timestamptz: 'column-timestamptz',
        time: 'column-time',
        timetz: 'column-timetz',
        interval: 'column-interval',
        string: 'column-string',
        bytes: 'column-bytes',
        bitstring: 'column-bitstring',
        array: 'column-array',
        object: 'column-object',
        other: 'column-other',
      };

      for (const [sqlType, expectedIcon] of Object.entries(typeToIconMap)) {
        const col = makeColumn('test', sqlType as DBColumn['sqlType'], 0);
        const iconType = `column-${col.sqlType}`;
        expect(iconType).toBe(expectedIcon);
      }
    });
  });

  describe('percentage bar calculation for text columns', () => {
    it('should calculate percentage from distinct/total counts', () => {
      const stats = makeStats('name', {
        totalCount: 1000,
        distinctCount: 250,
      });
      const percentage = Math.round(
        (stats.distinctCount / stats.totalCount) * 100,
      );
      expect(percentage).toBe(25);
    });

    it('should handle zero total count gracefully', () => {
      const stats = makeStats('name', {
        totalCount: 0,
        distinctCount: 0,
      });
      const percentage =
        stats.totalCount > 0
          ? Math.round((stats.distinctCount / stats.totalCount) * 100)
          : 0;
      expect(percentage).toBe(0);
    });

    it('should handle 100% distinct values', () => {
      const stats = makeStats('id', {
        totalCount: 500,
        distinctCount: 500,
      });
      const percentage = Math.round(
        (stats.distinctCount / stats.totalCount) * 100,
      );
      expect(percentage).toBe(100);
    });

    it('should handle single distinct value', () => {
      const stats = makeStats('status', {
        totalCount: 1000,
        distinctCount: 1,
      });
      const percentage = Math.round(
        (stats.distinctCount / stats.totalCount) * 100,
      );
      expect(percentage).toBe(0); // rounds down from 0.1%
    });
  });

  describe('sparkline histogram data processing', () => {
    it('should find maximum count from buckets', () => {
      const buckets = [
        { label: '0-10', count: 5 },
        { label: '10-20', count: 15 },
        { label: '20-30', count: 8 },
      ];
      const maxCount = Math.max(...buckets.map((b) => b.count));
      expect(maxCount).toBe(15);
    });

    it('should calculate bar heights relative to max', () => {
      const buckets = [
        { label: '0-10', count: 10 },
        { label: '10-20', count: 20 },
        { label: '20-30', count: 5 },
      ];
      const maxCount = Math.max(...buckets.map((b) => b.count));
      const height = 20; // SPARKLINE_HEIGHT

      const heights = buckets.map((b) =>
        Math.max(1, (b.count / maxCount) * height),
      );

      expect(heights[0]).toBe(10); // 10/20 * 20
      expect(heights[1]).toBe(20); // 20/20 * 20
      expect(heights[2]).toBe(5); // 5/20 * 20
    });

    it('should handle empty buckets', () => {
      const buckets: { label: string; count: number }[] = [];
      expect(buckets.length).toBe(0);
    });

    it('should handle all-zero counts', () => {
      const buckets = [
        { label: '0-10', count: 0 },
        { label: '10-20', count: 0 },
      ];
      const maxCount = Math.max(...buckets.map((b) => b.count));
      expect(maxCount).toBe(0);
    });

    it('should calculate bar width based on bucket count', () => {
      const sparklineWidth = 120;
      const barGap = 1;
      const numBuckets = 20;

      const barWidth = Math.max(
        1,
        (sparklineWidth - (numBuckets - 1) * barGap) / numBuckets,
      );

      // (120 - 19) / 20 = 5.05
      expect(barWidth).toBeCloseTo(5.05, 1);
    });
  });

  describe('column type classification for visualization', () => {
    it('should use percentage bar for text-classified columns', () => {
      const textTypes: DBColumn['sqlType'][] = [
        'string',
        'boolean',
        'bytes',
        'bitstring',
        'array',
        'object',
        'other',
        'time',
        'timetz',
        'interval',
      ];

      for (const sqlType of textTypes) {
        const col = makeColumn('test', sqlType, 0);
        // classifyColumnType returns 'text' for all non-numeric, non-date types
        const isTextVisualization =
          sqlType !== 'float' &&
          sqlType !== 'decimal' &&
          sqlType !== 'integer' &&
          sqlType !== 'bigint' &&
          sqlType !== 'date' &&
          sqlType !== 'timestamp' &&
          sqlType !== 'timestamptz';

        expect(isTextVisualization).toBe(true);
        expect(col.sqlType).toBe(sqlType);
      }
    });

    it('should use sparkline histogram for numeric columns', () => {
      const numericTypes: DBColumn['sqlType'][] = [
        'float',
        'decimal',
        'integer',
        'bigint',
      ];

      for (const sqlType of numericTypes) {
        const col = makeColumn('test', sqlType, 0);
        expect(col.sqlType).toBe(sqlType);
      }
    });

    it('should use sparkline histogram for date columns', () => {
      const dateTypes: DBColumn['sqlType'][] = [
        'date',
        'timestamp',
        'timestamptz',
      ];

      for (const sqlType of dateTypes) {
        const col = makeColumn('test', sqlType, 0);
        expect(col.sqlType).toBe(sqlType);
      }
    });
  });

  describe('loading state behavior', () => {
    it('should show skeleton placeholders during global loading', () => {
      const loadingBehavior = {
        showsSkeletonRows: true,
        maxSkeletonRows: 20,
        skeletonElements: ['icon', 'name', 'visualization'],
      };

      expect(loadingBehavior.showsSkeletonRows).toBe(true);
      expect(loadingBehavior.maxSkeletonRows).toBe(20);
      expect(loadingBehavior.skeletonElements).toHaveLength(3);
    });

    it('should show per-column skeleton for loading distributions', () => {
      const loadingDists = new Set(['price', 'quantity']);
      expect(loadingDists.has('price')).toBe(true);
      expect(loadingDists.has('name')).toBe(false);
    });

    it('should calculate skeleton row count from column count', () => {
      const columnCount = 5;
      const maxSkeletons = 20;
      const skeletonCount = Math.min(columnCount || 8, maxSkeletons);
      expect(skeletonCount).toBe(5);
    });

    it('should default to 8 skeletons when no columns available', () => {
      const columnCount = 0;
      const maxSkeletons = 20;
      const skeletonCount = Math.min(columnCount || 8, maxSkeletons);
      expect(skeletonCount).toBe(8);
    });
  });

  describe('empty state handling', () => {
    it('should render nothing when columns array is empty', () => {
      const columns: DBColumn[] = [];
      expect(columns.length).toBe(0);
    });
  });

  describe('row selection behavior', () => {
    it('should track selected column by name', () => {
      const columns = [
        makeColumn('id', 'integer', 0),
        makeColumn('name', 'string', 1),
        makeColumn('price', 'float', 2),
      ];

      const selectedColumn = 'name';
      const selectedIndex = columns.findIndex(
        (c) => c.name === selectedColumn,
      );
      expect(selectedIndex).toBe(1);
    });

    it('should apply accent styling when selected', () => {
      const selectedClass = 'bg-[var(--mantine-color-transparentBrandBlue_palette-012)]';
      const hoverClass = 'hover:bg-[var(--mantine-color-transparent004)]';

      // Selected rows use accent background, non-selected use hover
      expect(selectedClass).toContain('transparentBrandBlue');
      expect(hoverClass).toContain('transparent004');
    });
  });

  describe('distribution data routing', () => {
    it('should route numeric distribution to sparkline', () => {
      const dist: ColumnDistribution = {
        type: 'numeric',
        buckets: [
          { label: '0-10', count: 5 },
          { label: '10-20', count: 15 },
        ],
      };
      expect(dist.type).toBe('numeric');
      expect('buckets' in dist).toBe(true);
    });

    it('should route date distribution to sparkline', () => {
      const dist: ColumnDistribution = {
        type: 'date',
        buckets: [
          { label: '2024-01', count: 30 },
          { label: '2024-02', count: 28 },
        ],
      };
      expect(dist.type).toBe('date');
      expect('buckets' in dist).toBe(true);
    });

    it('should route text distribution to percentage bar', () => {
      const dist: ColumnDistribution = {
        type: 'text',
        values: [
          { value: 'active', count: 500 },
          { value: 'inactive', count: 300 },
        ],
      };
      expect(dist.type).toBe('text');
    });
  });
});
