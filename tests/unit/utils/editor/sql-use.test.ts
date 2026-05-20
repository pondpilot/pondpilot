import { describe, expect, it } from '@jest/globals';
import { classifySQLStatements, splitSQLByStats, validateStatements } from '@utils/editor/sql';

describe('SQL USE statement support', () => {
  it('allows USE statements in scripts', () => {
    const statements = classifySQLStatements([
      { code: 'USE memory;', lineNumber: 1, start: 0, end: 11 },
    ]);

    expect(validateStatements(statements, new Set())).toEqual([]);
  });

  it('splits USE statements with FlowScope spans', async () => {
    await expect(splitSQLByStats('USE foo;')).resolves.toHaveLength(1);
    await expect(splitSQLByStats('USE foo; SELECT 1;')).resolves.toHaveLength(2);
  });
});
