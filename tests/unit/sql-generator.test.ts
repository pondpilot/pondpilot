import { generateComparisonSQL } from '@features/comparison/utils/sql-generator';
import { describe, expect, it } from '@jest/globals';
import { ComparisonConfig, ComparisonSource, SchemaComparisonResult } from '@models/comparison';

const makeSource = (table: string): ComparisonSource => ({
  type: 'table',
  tableName: table,
  schemaName: 'main',
  databaseName: 'pond',
});

const schemaComparisonSample: SchemaComparisonResult = {
  commonColumns: [
    { name: 'id', typeA: 'INTEGER', typeB: 'INTEGER', typesMatch: true },
    { name: 'value', typeA: 'VARCHAR', typeB: 'VARCHAR', typesMatch: true },
  ],
  onlyInA: [],
  onlyInB: [],
  suggestedKeys: ['id'],
  rowCountA: null,
  rowCountB: null,
  rowCountSourceA: null,
  rowCountSourceB: null,
};

const baseConfig: ComparisonConfig = {
  sourceA: makeSource('table_a'),
  sourceB: makeSource('table_b'),
  joinColumns: ['id'],
  joinKeyMappings: {},
  columnMappings: {},
  excludedColumns: [],
  filterMode: 'common',
  commonFilter: null,
  filterA: null,
  filterB: null,
  showOnlyDifferences: true,
  compareMode: 'strict',
  algorithm: 'hash-bucket',
};

describe('generateComparisonSQL bucket option', () => {
  it('adds bucket condition for source A', () => {
    const sql = generateComparisonSQL(baseConfig, schemaComparisonSample, {
      hashFilter: { type: 'hash-bucket', modulus: 8, bucket: 3 },
      includeOrderBy: false,
    });

    expect(sql).toContain('((hash(struct_pack("id" := "id")) % 8) + 8) % 8 = 3');
  });

  it('maps bucket condition for source B using join key mappings', () => {
    const config: ComparisonConfig = {
      ...baseConfig,
      joinKeyMappings: { id: 'pk' },
    };

    const schema: SchemaComparisonResult = {
      ...schemaComparisonSample,
      commonColumns: [
        { name: 'id', typeA: 'INTEGER', typeB: 'INTEGER', typesMatch: true },
        { name: 'pk', typeA: 'INTEGER', typeB: 'INTEGER', typesMatch: true },
        { name: 'value', typeA: 'VARCHAR', typeB: 'VARCHAR', typesMatch: true },
      ],
      rowCountA: null,
      rowCountB: null,
      rowCountSourceA: null,
      rowCountSourceB: null,
    };

    const sql = generateComparisonSQL(config, schema, {
      hashFilter: { type: 'hash-bucket', modulus: 4, bucket: 1 },
      includeOrderBy: false,
    });

    expect(sql).toContain('((hash(struct_pack("pk" := "pk")) % 4) + 4) % 4 = 1');
  });

  it('adds hash range condition when requested', () => {
    const sql = generateComparisonSQL(baseConfig, schemaComparisonSample, {
      hashFilter: { type: 'hash-range', start: '0', end: '1024' },
      includeOrderBy: false,
    });

    expect(sql).toContain('hash(struct_pack("id" := "id")) BETWEEN 0::UBIGINT AND 1023::UBIGINT');
  });

  it('aliases query sources automatically', () => {
    const config: ComparisonConfig = {
      ...baseConfig,
      sourceA: {
        type: 'query',
        sql: 'SELECT id, value FROM table_a',
        alias: 'source_a_query',
      },
    };

    const sql = generateComparisonSQL(config, schemaComparisonSample, {
      includeOrderBy: false,
    });

    expect(sql).toContain('FROM (SELECT id, value FROM table_a) AS "source_a_query"');
  });
});
