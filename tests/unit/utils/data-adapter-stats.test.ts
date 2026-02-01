import { describe, it, expect } from '@jest/globals';
import {
  buildColumnStatsQuery,
  buildNumericDistributionQuery,
  buildTextDistributionQuery,
  buildDateDistributionQuery,
} from '@utils/data-adapter';

describe('buildColumnStatsQuery', () => {
  it('should build a stats query for a single column', () => {
    const query = buildColumnStatsQuery('my_table', ['amount']);

    expect(query).toContain('COUNT(*)');
    expect(query).toContain('COUNT(DISTINCT amount)');
    expect(query).toContain('COUNT(*) - COUNT(amount) AS null_count');
    expect(query).toContain('CAST(MIN(amount) AS VARCHAR) AS min_value');
    expect(query).toContain('CAST(MAX(amount) AS VARCHAR) AS max_value');
    expect(query).toContain('AVG(TRY_CAST(amount AS DOUBLE))');
    expect(query).toContain("'amount' AS column_name");
    expect(query).toContain('FROM my_table');
  });

  it('should build a UNION ALL query for multiple columns', () => {
    const query = buildColumnStatsQuery('sales', ['amount', 'quantity', 'name']);

    expect(query).toContain("'amount' AS column_name");
    expect(query).toContain("'quantity' AS column_name");
    expect(query).toContain("'name' AS column_name");
    // Should have two UNION ALL for three columns
    const unionCount = (query.match(/UNION ALL/g) || []).length;
    expect(unionCount).toBe(2);
  });

  it('should escape column names with spaces', () => {
    const query = buildColumnStatsQuery('data', ['Column Name']);

    expect(query).toContain('"Column Name"');
    expect(query).toContain("'Column Name' AS column_name");
  });

  it('should escape single quotes in column names for the string literal', () => {
    const query = buildColumnStatsQuery('data', ["it's"]);

    expect(query).toContain("'it''s' AS column_name");
  });

  it('should work with a subquery as source', () => {
    const query = buildColumnStatsQuery('(SELECT * FROM orders)', ['total']);

    expect(query).toContain('FROM (SELECT * FROM orders)');
  });

  it('should not quote simple identifiers', () => {
    const query = buildColumnStatsQuery('data', ['amount']);

    expect(query).toContain('COUNT(DISTINCT amount)');
    expect(query).not.toMatch(/"amount"/);
  });
});

describe('buildNumericDistributionQuery', () => {
  it('should build a histogram query with equi-width buckets', () => {
    const query = buildNumericDistributionQuery('my_table', 'price');

    expect(query).toContain('MIN(price)');
    expect(query).toContain('MAX(price)');
    expect(query).toContain('WHERE price IS NOT NULL');
    expect(query).toContain('FLOOR(');
    expect(query).toContain('AS label');
    expect(query).toContain('COUNT(*) AS count');
    expect(query).toContain('GROUP BY bucket');
    expect(query).toContain('ORDER BY bucket');
  });

  it('should handle edge case when min equals max', () => {
    const query = buildNumericDistributionQuery('data', 'value');

    expect(query).toContain('WHEN stats.max_val = stats.min_val THEN 0');
  });

  it('should escape column names with spaces', () => {
    const query = buildNumericDistributionQuery('data', 'Unit Price');

    expect(query).toContain('"Unit Price"');
  });

  it('should work with a subquery as source', () => {
    const query = buildNumericDistributionQuery('(SELECT * FROM orders)', 'total');

    expect(query).toContain('FROM (SELECT * FROM orders)');
  });
});

describe('buildTextDistributionQuery', () => {
  it('should build a top-N values query', () => {
    const query = buildTextDistributionQuery('my_table', 'category');

    expect(query).toContain('CAST(category AS VARCHAR) AS value');
    expect(query).toContain('COUNT(*) AS count');
    expect(query).toContain('WHERE category IS NOT NULL');
    expect(query).toContain('GROUP BY category');
    expect(query).toContain('ORDER BY count DESC');
    expect(query).toContain('LIMIT 20');
  });

  it('should escape column names with spaces', () => {
    const query = buildTextDistributionQuery('data', 'Product Category');

    expect(query).toContain('"Product Category"');
  });

  it('should work with a subquery as source', () => {
    const query = buildTextDistributionQuery('(SELECT * FROM users)', 'name');

    expect(query).toContain('FROM (SELECT * FROM users)');
  });
});

describe('buildDateDistributionQuery', () => {
  it('should build a time-bucketed distribution query', () => {
    const query = buildDateDistributionQuery('events', 'created_at');

    expect(query).toContain("DATEDIFF('day'");
    expect(query).toContain("DATE_TRUNC('day'");
    expect(query).toContain("DATE_TRUNC('month'");
    expect(query).toContain("DATE_TRUNC('year'");
    expect(query).toContain('WHERE created_at IS NOT NULL');
    expect(query).toContain('AS label');
    expect(query).toContain('COUNT(*) AS count');
  });

  it('should use CASE expression with literal interval strings for DATE_TRUNC', () => {
    const query = buildDateDistributionQuery('data', 'ts');

    // Should use CASE with literal strings (not column references) for DATE_TRUNC
    expect(query).toContain("WHEN dr.day_span <= 31 THEN DATE_TRUNC('day'");
    expect(query).toContain("WHEN dr.day_span <= 365 THEN DATE_TRUNC('month'");
    expect(query).toContain("ELSE DATE_TRUNC('year'");
  });

  it('should escape column names with spaces', () => {
    const query = buildDateDistributionQuery('data', 'Created At');

    expect(query).toContain('"Created At"');
  });

  it('should work with a subquery as source', () => {
    const query = buildDateDistributionQuery('(SELECT * FROM logs)', 'timestamp');

    expect(query).toContain('FROM (SELECT * FROM logs)');
  });
});
