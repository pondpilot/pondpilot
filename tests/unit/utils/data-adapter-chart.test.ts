import { describe, it, expect } from '@jest/globals';
import { buildChartAggregationQuery } from '@utils/data-adapter';

describe('buildChartAggregationQuery', () => {
  describe('basic aggregation queries', () => {
    it('should build a SUM aggregation query without group by', () => {
      const query = buildChartAggregationQuery(
        'my_table',
        'category',
        'amount',
        'sum',
        null,
        'x',
        null,
      );

      expect(query).toContain('SELECT');
      expect(query).toContain('CAST(category AS VARCHAR) AS x');
      expect(query).toContain('SUM(amount) AS y');
      expect(query).toContain('FROM my_table');
      expect(query).toContain('WHERE category IS NOT NULL');
      expect(query).toContain('GROUP BY category');
      expect(query).toContain('LIMIT 1000');
    });

    it('should build an AVG aggregation query', () => {
      const query = buildChartAggregationQuery(
        'sales',
        'region',
        'revenue',
        'avg',
        null,
        'x',
        null,
      );

      expect(query).toContain('AVG(revenue) AS y');
      expect(query).toContain('GROUP BY region');
    });

    it('should build a COUNT aggregation query', () => {
      const query = buildChartAggregationQuery('orders', 'status', 'id', 'count', null, 'x', null);

      expect(query).toContain('COUNT(id) AS y');
      expect(query).toContain('GROUP BY status');
    });

    it('should build MIN and MAX aggregation queries', () => {
      const minQuery = buildChartAggregationQuery(
        'products',
        'category',
        'price',
        'min',
        null,
        'x',
        null,
      );
      expect(minQuery).toContain('MIN(price) AS y');

      const maxQuery = buildChartAggregationQuery(
        'products',
        'category',
        'price',
        'max',
        null,
        'x',
        null,
      );
      expect(maxQuery).toContain('MAX(price) AS y');
    });
  });

  describe('with group by column', () => {
    it('should include group by column in select and group by clauses', () => {
      const query = buildChartAggregationQuery(
        'sales',
        'period',
        'revenue',
        'sum',
        'region',
        'x',
        null,
      );

      expect(query).toContain('CAST(period AS VARCHAR) AS x');
      expect(query).toContain('CAST(region AS VARCHAR) AS grp');
      expect(query).toContain('SUM(revenue) AS y');
      expect(query).toContain('GROUP BY period, region');
    });
  });

  describe('with sorting', () => {
    it('should add ORDER BY x ASC', () => {
      const query = buildChartAggregationQuery(
        'data',
        'category',
        'value',
        'sum',
        null,
        'x',
        'asc',
      );

      expect(query).toContain('ORDER BY x ASC');
    });

    it('should add ORDER BY x DESC', () => {
      const query = buildChartAggregationQuery(
        'data',
        'category',
        'value',
        'sum',
        null,
        'x',
        'desc',
      );

      expect(query).toContain('ORDER BY x DESC');
    });

    it('should add ORDER BY y ASC', () => {
      const query = buildChartAggregationQuery(
        'data',
        'category',
        'value',
        'sum',
        null,
        'y',
        'asc',
      );

      expect(query).toContain('ORDER BY y ASC');
    });

    it('should add ORDER BY y DESC', () => {
      const query = buildChartAggregationQuery(
        'data',
        'category',
        'value',
        'sum',
        null,
        'y',
        'desc',
      );

      expect(query).toContain('ORDER BY y DESC');
    });

    it('should not include ORDER BY when sortOrder is null', () => {
      const query = buildChartAggregationQuery('data', 'category', 'value', 'sum', null, 'x', null);

      expect(query).not.toContain('ORDER BY');
    });
  });

  describe('with subquery source', () => {
    it('should work with a subquery as source', () => {
      const query = buildChartAggregationQuery(
        "(SELECT * FROM orders WHERE status = 'completed')",
        'product',
        'quantity',
        'sum',
        null,
        'y',
        'desc',
      );

      expect(query).toContain("FROM (SELECT * FROM orders WHERE status = 'completed')");
      expect(query).toContain('GROUP BY product');
      expect(query).toContain('ORDER BY y DESC');
    });
  });

  describe('identifier escaping', () => {
    it('should properly escape column names with spaces', () => {
      const query = buildChartAggregationQuery(
        'data',
        'Column Name',
        'Value Field',
        'sum',
        'Group By',
        'x',
        null,
      );

      // Identifiers with spaces should be quoted
      expect(query).toContain('"Column Name"');
      expect(query).toContain('"Value Field"');
      expect(query).toContain('"Group By"');
    });

    it('should not quote simple identifiers', () => {
      const query = buildChartAggregationQuery(
        'data',
        'category',
        'amount',
        'sum',
        null,
        'x',
        null,
      );

      // Simple identifiers should not be quoted
      expect(query).toContain('category');
      expect(query).toContain('amount');
      expect(query).not.toMatch(/"category"/);
      expect(query).not.toMatch(/"amount"/);
    });
  });

  describe('NULL filtering', () => {
    it('should filter out NULL x values', () => {
      const query = buildChartAggregationQuery(
        'data',
        'category',
        'amount',
        'sum',
        null,
        'x',
        null,
      );

      expect(query).toContain('WHERE category IS NOT NULL');
    });
  });

  describe('row limit', () => {
    it('should limit results to 1000 rows', () => {
      const query = buildChartAggregationQuery(
        'data',
        'category',
        'amount',
        'sum',
        null,
        'x',
        null,
      );

      expect(query).toContain('LIMIT 1000');
    });
  });
});
