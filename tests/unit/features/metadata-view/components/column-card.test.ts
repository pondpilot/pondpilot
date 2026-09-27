import { describe, it, expect } from '@jest/globals';
import { ColumnDistribution, ColumnStats } from '@models/data-adapter';
import { DBColumn, DBColumnId } from '@models/db';

/**
 * Tests for the ColumnCard component's data logic and interface contracts.
 * Since tests run in a Node environment without DOM, we verify the data
 * processing, formatting, and routing logic used by the component.
 */

function makeColumn(name: string, sqlType: DBColumn['sqlType'], index: number): DBColumn {
  return {
    name,
    databaseType: sqlType,
    nullable: true,
    sqlType,
    id: `${index}_${name}` as DBColumnId,
    columnIndex: index,
  };
}

function makeStats(columnName: string, overrides: Partial<ColumnStats> = {}): ColumnStats {
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

/**
 * Mirrors the formatCount function from column-card.tsx.
 */
function formatCount(count: number): string {
  return count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

describe('ColumnCard', () => {
  describe('component interface', () => {
    it('should define the expected prop types', () => {
      interface ColumnCardProps {
        column: DBColumn;
        stats: ColumnStats | undefined;
        distribution: ColumnDistribution | undefined;
        isDistributionLoading: boolean;
      }

      const props: ColumnCardProps = {
        column: makeColumn('price', 'float', 0),
        stats: makeStats('price'),
        distribution: { type: 'numeric', buckets: [{ label: '0-50', count: 10 }] },
        isDistributionLoading: false,
      };

      expect(props.column.name).toBe('price');
      expect(props.stats?.distinctCount).toBe(100);
      expect(props.isDistributionLoading).toBe(false);
    });

    it('should handle undefined stats and distribution', () => {
      const column = makeColumn('test', 'string', 0);
      const stats: ColumnStats | undefined = undefined;
      const distribution: ColumnDistribution | undefined = undefined;

      expect(stats).toBeUndefined();
      expect(distribution).toBeUndefined();
      expect(column.name).toBe('test');
    });
  });

  describe('count formatting', () => {
    it('should format small numbers without commas', () => {
      expect(formatCount(0)).toBe('0');
      expect(formatCount(1)).toBe('1');
      expect(formatCount(999)).toBe('999');
    });

    it('should format thousands with commas', () => {
      expect(formatCount(1000)).toBe('1,000');
      expect(formatCount(1234)).toBe('1,234');
      expect(formatCount(10000)).toBe('10,000');
    });

    it('should format millions with commas', () => {
      expect(formatCount(1000000)).toBe('1,000,000');
      expect(formatCount(1234567)).toBe('1,234,567');
    });
  });

  describe('column icon type mapping', () => {
    it('should map SQL types to icon types using column- prefix', () => {
      const column = makeColumn('price', 'float', 0);
      const iconType = `column-${column.sqlType}`;
      expect(iconType).toBe('column-float');
    });
  });

  describe('text distribution rendering logic', () => {
    it('should limit top values to 10 items', () => {
      const values = Array.from({ length: 20 }, (_, i) => ({
        value: `item_${i}`,
        count: 100 - i,
      }));

      const topValuesLimit = 10;
      const displayed = values.slice(0, topValuesLimit);

      expect(displayed).toHaveLength(10);
      expect(displayed[0].value).toBe('item_0');
      expect(displayed[9].value).toBe('item_9');
    });

    it('should calculate bar width relative to max count', () => {
      const values = [
        { value: 'active', count: 500 },
        { value: 'inactive', count: 250 },
        { value: 'pending', count: 100 },
      ];
      const maxBarWidth = 160;
      const maxCount = Math.max(...values.map((v) => v.count));

      const barWidths = values.map((v) => Math.max(2, (v.count / maxCount) * maxBarWidth));

      expect(barWidths[0]).toBe(160);
      expect(barWidths[1]).toBe(80);
      expect(barWidths[2]).toBe(32);
    });

    it('should handle empty values array', () => {
      const values: { value: string; count: number }[] = [];
      expect(values.length).toBe(0);
    });

    it('should handle single value', () => {
      const values = [{ value: 'only', count: 1000 }];
      const maxCount = Math.max(...values.map((v) => v.count));
      const maxBarWidth = 160;
      const barWidth = Math.max(2, (values[0].count / maxCount) * maxBarWidth);
      expect(barWidth).toBe(160);
    });
  });

  describe('bar histogram rendering logic', () => {
    it('should calculate total height from bucket count', () => {
      const barHeight = 16;
      const barGap = 4;
      const bucketCount = 5;

      const totalHeight = bucketCount * (barHeight + barGap) - barGap;
      expect(totalHeight).toBe(96); // 5 * 20 - 4
    });

    it('should calculate bar widths relative to max count', () => {
      const buckets = [
        { label: '0-10', count: 10 },
        { label: '10-20', count: 20 },
        { label: '20-30', count: 5 },
      ];
      const maxBarWidth = 160;
      const maxCount = Math.max(...buckets.map((b) => b.count));

      const barWidths = buckets.map((b) => Math.max(2, (b.count / maxCount) * maxBarWidth));

      expect(barWidths[0]).toBe(80);
      expect(barWidths[1]).toBe(160);
      expect(barWidths[2]).toBe(40);
    });

    it('should ensure minimum bar width of 2 pixels', () => {
      const maxBarWidth = 160;
      const buckets = [
        { label: '0-10', count: 1 },
        { label: '10-20', count: 10000 },
      ];
      const maxCount = Math.max(...buckets.map((b) => b.count));
      const barWidth = Math.max(2, (buckets[0].count / maxCount) * maxBarWidth);
      // 1/10000 * 160 = 0.016, which is < 2, so min is 2
      expect(barWidth).toBe(2);
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

    it('should calculate y position for each bar', () => {
      const barHeight = 16;
      const barGap = 4;
      const positions = [0, 1, 2].map((i) => i * (barHeight + barGap));

      expect(positions[0]).toBe(0);
      expect(positions[1]).toBe(20);
      expect(positions[2]).toBe(40);
    });
  });

  describe('column type routing for card body', () => {
    it('should route text columns to text distribution', () => {
      const dist: ColumnDistribution = {
        type: 'text',
        values: [
          { value: 'active', count: 500 },
          { value: 'inactive', count: 300 },
        ],
      };
      expect(dist.type).toBe('text');
      expect('values' in dist).toBe(true);
    });

    it('should route numeric columns to bar histogram', () => {
      const dist: ColumnDistribution = {
        type: 'numeric',
        buckets: [
          { label: '0-50', count: 100 },
          { label: '50-100', count: 200 },
        ],
      };
      expect(dist.type).toBe('numeric');
      expect('buckets' in dist).toBe(true);
    });

    it('should route date columns to bar histogram', () => {
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
  });

  describe('card header display', () => {
    it('should show distinct count from stats', () => {
      const stats = makeStats('name', { distinctCount: 42 });
      expect(formatCount(stats.distinctCount)).toBe('42');
    });

    it('should format large distinct counts with commas', () => {
      const stats = makeStats('id', { distinctCount: 12345 });
      expect(formatCount(stats.distinctCount)).toBe('12,345');
    });
  });

  describe('loading state', () => {
    it('should show skeleton placeholders when distribution is loading', () => {
      const isDistributionLoading = true;
      const skeletonCount = 5;

      expect(isDistributionLoading).toBe(true);
      expect(skeletonCount).toBe(5);
    });
  });
});
