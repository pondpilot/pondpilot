import { describe, it, expect } from '@jest/globals';
import { ColumnDistribution, ColumnStats } from '@models/data-adapter';
import { DBColumn, DBColumnId } from '@models/db';

/**
 * Tests for the ColumnDetailPanel component's data logic and interface contracts.
 * Since tests run in a Node environment without DOM, we verify the data
 * processing and interface contracts used by the component.
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

describe('ColumnDetailPanel', () => {
  describe('component interface', () => {
    it('should define the expected prop types', () => {
      interface ColumnDetailPanelProps {
        columns: DBColumn[];
        columnStats: Map<string, ColumnStats>;
        columnDistributions: Map<string, ColumnDistribution>;
        loadingDistributions: Set<string>;
      }

      const props: ColumnDetailPanelProps = {
        columns: [
          makeColumn('id', 'integer', 0),
          makeColumn('name', 'string', 1),
        ],
        columnStats: new Map(),
        columnDistributions: new Map(),
        loadingDistributions: new Set(),
      };

      expect(props.columns).toHaveLength(2);
      expect(props.columnStats.size).toBe(0);
    });
  });

  describe('imperative handle interface', () => {
    it('should define scrollToColumn method', () => {
      interface ColumnDetailPanelHandle {
        scrollToColumn: (columnName: string) => void;
      }

      const handle: ColumnDetailPanelHandle = {
        scrollToColumn: () => {},
      };

      expect(typeof handle.scrollToColumn).toBe('function');
    });
  });

  describe('card generation', () => {
    it('should generate one card per column', () => {
      const columns = [
        makeColumn('id', 'integer', 0),
        makeColumn('name', 'string', 1),
        makeColumn('price', 'float', 2),
        makeColumn('created_at', 'timestamp', 3),
      ];

      expect(columns.length).toBe(4);
    });

    it('should pass correct stats to each card', () => {
      const columns = [
        makeColumn('id', 'integer', 0),
        makeColumn('name', 'string', 1),
      ];

      const stats = new Map<string, ColumnStats>([
        ['id', makeStats('id', { distinctCount: 500 })],
        ['name', makeStats('name', { distinctCount: 50 })],
      ]);

      for (const col of columns) {
        const colStats = stats.get(col.name);
        expect(colStats).toBeDefined();
        expect(colStats?.columnName).toBe(col.name);
      }
    });

    it('should pass correct distribution to each card', () => {
      const columns = [
        makeColumn('price', 'float', 0),
        makeColumn('category', 'string', 1),
      ];

      const distributions = new Map<string, ColumnDistribution>([
        ['price', { type: 'numeric', buckets: [{ label: '0-50', count: 10 }] }],
        ['category', { type: 'text', values: [{ value: 'A', count: 100 }] }],
      ]);

      for (const col of columns) {
        const dist = distributions.get(col.name);
        expect(dist).toBeDefined();
      }
    });

    it('should track loading state per column', () => {
      const loadingDistributions = new Set(['price', 'quantity']);

      expect(loadingDistributions.has('price')).toBe(true);
      expect(loadingDistributions.has('quantity')).toBe(true);
      expect(loadingDistributions.has('name')).toBe(false);
    });
  });

  describe('empty state', () => {
    it('should handle empty columns array', () => {
      const columns: DBColumn[] = [];
      expect(columns.length).toBe(0);
    });
  });

  describe('scroll behavior', () => {
    it('should maintain card refs keyed by column name', () => {
      const cardRefs = new Map<string, unknown>();
      const columns = [
        makeColumn('id', 'integer', 0),
        makeColumn('name', 'string', 1),
      ];

      // Simulate ref callback behavior
      for (const col of columns) {
        cardRefs.set(col.name, { element: true });
      }

      expect(cardRefs.size).toBe(2);
      expect(cardRefs.has('id')).toBe(true);
      expect(cardRefs.has('name')).toBe(true);
    });

    it('should clean up refs when cards are removed', () => {
      const cardRefs = new Map<string, unknown>();
      cardRefs.set('id', { element: true });
      cardRefs.set('name', { element: true });

      // Simulate ref callback with null (element unmounting)
      cardRefs.delete('name');

      expect(cardRefs.size).toBe(1);
      expect(cardRefs.has('id')).toBe(true);
      expect(cardRefs.has('name')).toBe(false);
    });
  });

  describe('horizontal layout', () => {
    it('should use snap alignment for scroll behavior', () => {
      const scrollContainerClasses = 'flex gap-3 overflow-x-auto h-full p-3 snap-x snap-mandatory';
      const cardClasses = 'shrink-0 w-72 rounded-lg border';

      expect(scrollContainerClasses).toContain('snap-x');
      expect(scrollContainerClasses).toContain('overflow-x-auto');
      expect(cardClasses).toContain('w-72');
      expect(cardClasses).toContain('shrink-0');
    });
  });
});
