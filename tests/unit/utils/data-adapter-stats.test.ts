import { describe, it, expect } from '@jest/globals';
import {
  buildColumnStatsQuery,
  buildNumericDistributionQuery,
  buildTextDistributionQuery,
  buildDateDistributionQuery,
  buildSummarizeQuery,
  buildAllDistributionsQuery,
  convertArrowToColumnStatsFromSummarize,
  convertArrowToAllDistributions,
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

describe('buildSummarizeQuery', () => {
  it('should build a SUMMARIZE query', () => {
    const query = buildSummarizeQuery('my_table');

    expect(query).toBe('SUMMARIZE SELECT * FROM my_table');
  });

  it('should work with a subquery as source', () => {
    const query = buildSummarizeQuery('(SELECT * FROM orders)');

    expect(query).toBe('SUMMARIZE SELECT * FROM (SELECT * FROM orders)');
  });

  it('should work with a fully qualified name', () => {
    const query = buildSummarizeQuery('main."my_schema"."my_table"');

    expect(query).toBe('SUMMARIZE SELECT * FROM main."my_schema"."my_table"');
  });
});

describe('convertArrowToColumnStatsFromSummarize', () => {
  function createMockArrowTable(
    rows: Array<{
      column_name: string;
      column_type: string;
      min: string | null;
      max: string | null;
      approx_unique: number;
      avg: string | null;
      std: string | null;
      q25: string | null;
      q50: string | null;
      q75: string | null;
      count: number;
      null_percentage: string;
    }>,
  ) {
    const fieldNames = [
      'column_name',
      'column_type',
      'min',
      'max',
      'approx_unique',
      'avg',
      'std',
      'q25',
      'q50',
      'q75',
      'count',
      'null_percentage',
    ];

    const columns = fieldNames.map((name) => ({
      get: (i: number) => {
        const row = rows[i];
        return (row as any)[name];
      },
    }));

    return {
      numRows: rows.length,
      schema: {
        fields: fieldNames.map((name) => ({ name })),
      },
      getChildAt: (idx: number) => columns[idx],
    };
  }

  it('should convert a single row', () => {
    const arrowTable = createMockArrowTable([
      {
        column_name: 'amount',
        column_type: 'INTEGER',
        min: '1',
        max: '100',
        approx_unique: 50,
        avg: '50.5',
        std: '28.9',
        q25: '25',
        q50: '50',
        q75: '75',
        count: 200,
        null_percentage: '5.00%',
      },
    ]);

    const result = convertArrowToColumnStatsFromSummarize(arrowTable);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      columnName: 'amount',
      totalCount: 200,
      distinctCount: 50,
      nullCount: 10, // 5% of 200
      min: '1',
      max: '100',
      mean: '50.5',
    });
  });

  it('should handle zero null percentage', () => {
    const arrowTable = createMockArrowTable([
      {
        column_name: 'id',
        column_type: 'BIGINT',
        min: '1',
        max: '1000',
        approx_unique: 1000,
        avg: '500',
        std: '288',
        q25: '250',
        q50: '500',
        q75: '750',
        count: 1000,
        null_percentage: '0.00%',
      },
    ]);

    const result = convertArrowToColumnStatsFromSummarize(arrowTable);

    expect(result[0].nullCount).toBe(0);
  });

  it('should handle null min/max/avg values', () => {
    const arrowTable = createMockArrowTable([
      {
        column_name: 'notes',
        column_type: 'VARCHAR',
        min: null,
        max: null,
        approx_unique: 0,
        avg: null,
        std: null,
        q25: null,
        q50: null,
        q75: null,
        count: 100,
        null_percentage: '100.00%',
      },
    ]);

    const result = convertArrowToColumnStatsFromSummarize(arrowTable);

    expect(result[0].min).toBeNull();
    expect(result[0].max).toBeNull();
    expect(result[0].mean).toBeNull();
    expect(result[0].nullCount).toBe(100);
  });

  it('should handle multiple rows', () => {
    const arrowTable = createMockArrowTable([
      {
        column_name: 'a',
        column_type: 'INTEGER',
        min: '0',
        max: '10',
        approx_unique: 5,
        avg: '5',
        std: '3',
        q25: '2',
        q50: '5',
        q75: '8',
        count: 50,
        null_percentage: '0.00%',
      },
      {
        column_name: 'b',
        column_type: 'VARCHAR',
        min: 'abc',
        max: 'xyz',
        approx_unique: 20,
        avg: null,
        std: null,
        q25: null,
        q50: null,
        q75: null,
        count: 50,
        null_percentage: '10.00%',
      },
    ]);

    const result = convertArrowToColumnStatsFromSummarize(arrowTable);

    expect(result).toHaveLength(2);
    expect(result[0].columnName).toBe('a');
    expect(result[1].columnName).toBe('b');
    expect(result[1].nullCount).toBe(5); // 10% of 50
  });
});

describe('buildAllDistributionsQuery', () => {
  it('should return empty-result query for no columns', () => {
    const query = buildAllDistributionsQuery('my_table', []);

    expect(query).toContain('WHERE 1=0');
    expect(query).toContain('column_name');
    expect(query).toContain('label');
    expect(query).toContain('count');
  });

  it('should build a single subquery for one numeric column', () => {
    const query = buildAllDistributionsQuery('my_table', [{ name: 'price', type: 'numeric' }]);

    expect(query).toContain("'price' AS column_name");
    expect(query).toContain('label');
    expect(query).toContain('count');
    expect(query).not.toContain('UNION ALL');
  });

  it('should build UNION ALL for multiple columns', () => {
    const query = buildAllDistributionsQuery('data', [
      { name: 'price', type: 'numeric' },
      { name: 'name', type: 'text' },
      { name: 'created', type: 'date' },
    ]);

    expect(query).toContain("'price' AS column_name");
    expect(query).toContain("'name' AS column_name");
    expect(query).toContain("'created' AS column_name");
    const unionCount = (query.match(/UNION ALL/g) || []).length;
    expect(unionCount).toBe(2);
  });

  it('should alias text value column as label', () => {
    const query = buildAllDistributionsQuery('data', [{ name: 'category', type: 'text' }]);

    expect(query).toContain('value AS label');
  });

  it('should escape single quotes in column names', () => {
    const query = buildAllDistributionsQuery('data', [{ name: "it's", type: 'text' }]);

    expect(query).toContain("'it''s' AS column_name");
  });

  it('should work with a subquery as source', () => {
    const query = buildAllDistributionsQuery('(SELECT * FROM orders)', [
      { name: 'total', type: 'numeric' },
    ]);

    expect(query).toContain('FROM (SELECT * FROM orders)');
  });
});

describe('convertArrowToAllDistributions', () => {
  function createMockDistributionArrowTable(
    rows: Array<{ column_name: string; label: string | null; count: number }>,
  ) {
    return {
      numRows: rows.length,
      getChildAt: (idx: number) => ({
        get: (i: number) => {
          const row = rows[i];
          if (idx === 0) return row.column_name;
          if (idx === 1) return row.label;
          return row.count;
        },
      }),
    };
  }

  it('should group rows into distributions by column name', () => {
    const arrowTable = createMockDistributionArrowTable([
      { column_name: 'price', label: '0 - 50', count: 10 },
      { column_name: 'price', label: '50 - 100', count: 20 },
      { column_name: 'name', label: 'Alice', count: 5 },
      { column_name: 'name', label: 'Bob', count: 3 },
    ]);

    const columns = [
      { name: 'price', type: 'numeric' as const },
      { name: 'name', type: 'text' as const },
    ];

    const result = convertArrowToAllDistributions(arrowTable, columns);

    expect(result.size).toBe(2);

    const priceDistribution = result.get('price');
    expect(priceDistribution).toEqual({
      type: 'numeric',
      buckets: [
        { label: '0 - 50', count: 10 },
        { label: '50 - 100', count: 20 },
      ],
    });

    const nameDistribution = result.get('name');
    expect(nameDistribution).toEqual({
      type: 'text',
      values: [
        { value: 'Alice', count: 5 },
        { value: 'Bob', count: 3 },
      ],
    });
  });

  it('should handle date columns', () => {
    const arrowTable = createMockDistributionArrowTable([
      { column_name: 'created', label: '2024-01-01', count: 15 },
      { column_name: 'created', label: '2024-02-01', count: 25 },
    ]);

    const columns = [{ name: 'created', type: 'date' as const }];

    const result = convertArrowToAllDistributions(arrowTable, columns);

    expect(result.size).toBe(1);
    const dist = result.get('created');
    expect(dist).toEqual({
      type: 'date',
      buckets: [
        { label: '2024-01-01', count: 15 },
        { label: '2024-02-01', count: 25 },
      ],
    });
  });

  it('should skip rows with null labels', () => {
    const arrowTable = createMockDistributionArrowTable([
      { column_name: 'price', label: '0 - 50', count: 10 },
      { column_name: 'price', label: null, count: 5 },
    ]);

    const columns = [{ name: 'price', type: 'numeric' as const }];

    const result = convertArrowToAllDistributions(arrowTable, columns);

    const dist = result.get('price');
    expect(dist).toEqual({
      type: 'numeric',
      buckets: [{ label: '0 - 50', count: 10 }],
    });
  });

  it('should return empty map for empty arrow table', () => {
    const arrowTable = createMockDistributionArrowTable([]);
    const columns = [{ name: 'price', type: 'numeric' as const }];

    const result = convertArrowToAllDistributions(arrowTable, columns);

    expect(result.size).toBe(0);
  });
});
