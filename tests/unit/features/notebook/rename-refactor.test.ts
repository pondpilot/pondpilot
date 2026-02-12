import { previewNotebookAliasRenameRefactor } from '@features/notebook/utils/rename-refactor';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotebookCell } from '@models/notebook';

const splitSQLByStatsMock = jest.fn(async (sql: string) => [{
  code: sql,
  start: 0,
  end: sql.length,
}]);

jest.mock('@utils/editor/sql', () => ({
  splitSQLByStats: (sql: string) => splitSQLByStatsMock(sql),
}));

const makeSqlCell = (
  id: string,
  content: string,
  name: string | null,
): NotebookCell => ({
  id: id as any,
  ref: `__pp_cell_${id}` as any,
  name,
  type: 'sql',
  content,
  order: 0,
});

describe('previewNotebookAliasRenameRefactor', () => {
  beforeEach(() => {
    splitSQLByStatsMock.mockReset();
    splitSQLByStatsMock.mockImplementation(async (sql: string) => [{
      code: sql,
      start: 0,
      end: sql.length,
    }]);
  });

  it('rewrites identifier references and skips comments/strings', async () => {
    const source = makeSqlCell('source', 'SELECT 1', 'old_alias');
    const consumer = makeSqlCell(
      'consumer',
      [
        'SELECT * FROM old_alias;',
        '-- old_alias should stay in comment',
        "SELECT 'old_alias' AS str_value, \"old_alias\" AS quoted_value, old_alias AS real_ref;",
      ].join('\n'),
      null,
    );

    const preview = await previewNotebookAliasRenameRefactor(
      [source, consumer],
      source.id,
      'new_alias',
    );

    expect(preview.patches).toHaveLength(1);
    expect(preview.patches[0].newContent).toContain('FROM new_alias');
    expect(preview.patches[0].newContent).toContain('"new_alias" AS quoted_value');
    expect(preview.patches[0].newContent).toContain("'old_alias' AS str_value");
    expect(preview.patches[0].newContent).toContain('-- old_alias should stay in comment');
    expect(preview.parserFallbackCount).toBe(0);
  });

  it('rewrites references to stable ref when alias is removed', async () => {
    const source = makeSqlCell('source', 'SELECT 1', 'old_alias');
    const consumer = makeSqlCell('consumer', 'SELECT * FROM old_alias', null);

    const preview = await previewNotebookAliasRenameRefactor(
      [source, consumer],
      source.id,
      null,
    );

    expect(preview.replacementName).toBe('__pp_cell_source');
    expect(preview.patches).toHaveLength(1);
    expect(preview.patches[0].newContent).toContain('SELECT * FROM __pp_cell_source');
  });

  it('uses lexical fallback when parser fails', async () => {
    splitSQLByStatsMock.mockRejectedValueOnce(new Error('parser unavailable'));

    const source = makeSqlCell('source', 'SELECT 1', 'old_alias');
    const consumer = makeSqlCell('consumer', 'SELECT * FROM old_alias', null);

    const preview = await previewNotebookAliasRenameRefactor(
      [source, consumer],
      source.id,
      'new_alias',
    );

    expect(preview.patches).toHaveLength(1);
    expect(preview.patches[0].newContent).toContain('SELECT * FROM new_alias');
    expect(preview.parserFallbackCount).toBe(1);
  });
});
