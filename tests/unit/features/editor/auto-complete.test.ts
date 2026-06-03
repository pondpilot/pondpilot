import { convertToFlowScopeSchema } from '@features/editor/auto-complete';
import { describe, expect, it } from '@jest/globals';
import { DataBaseModel } from '@models/db';

const databases: DataBaseModel[] = [
  {
    name: 'pondpilot',
    schemas: [
      {
        name: 'main',
        objects: [
          {
            name: 'local_table',
            label: 'local_table',
            type: 'table',
            columns: [],
          },
        ],
      },
    ],
  },
  {
    name: 'duckdb-demo',
    schemas: [
      {
        name: 'main',
        objects: [
          {
            name: 'bank_failures',
            label: 'bank_failures',
            type: 'table',
            columns: [],
          },
        ],
      },
    ],
  },
];

describe('convertToFlowScopeSchema', () => {
  it('uses script session catalog and schema as FlowScope defaults', () => {
    const schema = convertToFlowScopeSchema(databases, {
      defaultCatalog: 'duckdb-demo',
      defaultSchema: 'main',
    });

    expect(schema.defaultCatalog).toBe('duckdb-demo');
    expect(schema.defaultSchema).toBe('main');
    expect(schema.searchPath).toEqual([{ catalog: 'duckdb-demo', schema: 'main' }]);
    expect(schema.tables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ catalog: 'pondpilot', schema: 'main', name: 'local_table' }),
        expect.objectContaining({ catalog: 'duckdb-demo', schema: 'main', name: 'bank_failures' }),
      ]),
    );
  });

  it('falls back to persistent main defaults when session is unset', () => {
    const schema = convertToFlowScopeSchema(databases);

    expect(schema.defaultCatalog).toBe('pondpilot');
    expect(schema.defaultSchema).toBe('main');
    expect(schema.searchPath).toEqual([{ catalog: 'pondpilot', schema: 'main' }]);
  });
});
