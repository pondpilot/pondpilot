/* eslint-disable import/order -- Jest mock factories must run before the module under test. */
import { describe, expect, it, jest } from '@jest/globals';

const mockToDuckDBIdentifier = jest.fn((value: string) => `<${value}>`);

jest.mock('@utils/duckdb/identifier', () => {
  const actual = jest.requireActual<typeof import('@utils/duckdb/identifier')>(
    '@utils/duckdb/identifier',
  );

  return { ...actual, toDuckDBIdentifier: mockToDuckDBIdentifier };
});

// eslint-disable-next-line import/first -- See the hoisting note above.
import { checkValidDuckDBIdentifer } from '@utils/duckdb/identifier';
// eslint-disable-next-line import/first -- See the hoisting note above.
import { buildDetachQuery } from '@utils/sql-builder';

describe('partial module mock migration contract', () => {
  it('[pilot:mock.production-consumer] uses the mocked export through an alias', () => {
    expect(buildDetachQuery('analytics')).toBe('DETACH DATABASE IF EXISTS <analytics>');
    expect(mockToDuckDBIdentifier).toHaveBeenCalledWith('analytics');
  });

  it('[pilot:mock.partial-actual-export] preserves non-overridden actual exports', () => {
    expect(checkValidDuckDBIdentifer('valid_name')).toBe(true);
    expect(checkValidDuckDBIdentifer('select')).toBe(false);
  });
});
