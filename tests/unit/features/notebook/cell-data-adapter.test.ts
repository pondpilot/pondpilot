import { resolveReusableNotebookLastQuery } from '@features/notebook/utils/query-restoration';
import { describe, expect, it } from '@jest/globals';

describe('resolveReusableNotebookLastQuery', () => {
  const sessionStartMs = Date.parse('2026-02-12T10:00:00.000Z');

  it('returns null when query is missing or blank', () => {
    expect(
      resolveReusableNotebookLastQuery(
        { lastQuery: null, lastRunAt: null },
        '__pp_cell_',
        sessionStartMs,
      ),
    ).toBeNull();
    expect(
      resolveReusableNotebookLastQuery(
        { lastQuery: '   ', lastRunAt: '2026-02-12T10:01:00.000Z' },
        '__pp_cell_',
        sessionStartMs,
      ),
    ).toBeNull();
  });

  it('returns null for notebook temp-view references', () => {
    expect(
      resolveReusableNotebookLastQuery(
        {
          lastQuery: 'SELECT * FROM __pp_cell_abc123',
          lastRunAt: '2026-02-12T10:01:00.000Z',
        },
        '__pp_cell_',
        sessionStartMs,
      ),
    ).toBeNull();
  });

  it('returns null for queries executed before current app session', () => {
    expect(
      resolveReusableNotebookLastQuery(
        {
          lastQuery: 'SELECT * FROM test2',
          lastRunAt: '2026-02-12T09:59:59.000Z',
        },
        '__pp_cell_',
        sessionStartMs,
      ),
    ).toBeNull();
  });

  it('returns trimmed query when executed in current app session', () => {
    expect(
      resolveReusableNotebookLastQuery(
        {
          lastQuery: '  SELECT * FROM test2  ',
          lastRunAt: '2026-02-12T10:00:00.000Z',
        },
        '__pp_cell_',
        sessionStartMs,
      ),
    ).toBe('SELECT * FROM test2');
  });
});
