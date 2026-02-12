import { describe, expect, it } from '@jest/globals';
import { DEFAULT_CHART_CONFIG } from '@models/chart';
import { Notebook, CellId, NotebookId } from '@models/notebook';
import {
  notebookToSqlnb,
  parseSqlnb,
  notebookToHtml,
  sqlnbCellsToNotebookCells,
  SqlnbFormat,
} from '@utils/notebook-export';

// Helper to create a test notebook
function makeNotebook(overrides?: Partial<Notebook>): Notebook {
  return {
    id: 'test-notebook-id' as NotebookId,
    name: 'Test Notebook',
    cells: [
      {
        id: 'cell-1' as CellId,
        type: 'sql',
        content: 'SELECT * FROM users',
        order: 0,
      },
      {
        id: 'cell-2' as CellId,
        type: 'markdown',
        content: '## Analysis\nThis shows user data.',
        order: 1,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('notebookToSqlnb', () => {
  it('should serialize a notebook to .sqlnb format', () => {
    const notebook = makeNotebook();
    const result = notebookToSqlnb(notebook, '0.7.0');

    expect(result.version).toBe(1);
    expect(result.name).toBe('Test Notebook');
    expect(result.cells).toHaveLength(2);
    expect(result.cells[0].type).toBe('sql');
    expect(result.cells[0].content).toBe('SELECT * FROM users');
    expect(result.cells[1].type).toBe('markdown');
    expect(result.cells[1].content).toBe('## Analysis\nThis shows user data.');
    expect(result.metadata.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result.metadata.pondpilotVersion).toBe('0.7.0');
  });

  it('should sort cells by order before serialization', () => {
    const notebook = makeNotebook({
      cells: [
        { id: 'cell-a' as CellId, type: 'markdown', content: 'Second', order: 1 },
        { id: 'cell-b' as CellId, type: 'sql', content: 'First', order: 0 },
      ],
    });
    const result = notebookToSqlnb(notebook, '0.7.0');

    expect(result.cells[0].content).toBe('First');
    expect(result.cells[1].content).toBe('Second');
  });

  it('should include user-defined cell names when present', () => {
    const notebook = makeNotebook({
      cells: [
        {
          id: 'cell-1' as CellId,
          type: 'sql',
          content: '-- @name: revenue\nSELECT sum(amount) FROM sales',
          order: 0,
        },
      ],
    });
    const result = notebookToSqlnb(notebook, '0.7.0');

    expect(result.cells[0].name).toBe('revenue');
  });

  it('should include SQL cell output settings', () => {
    const notebook = makeNotebook({
      cells: [
        {
          id: 'cell-1' as CellId,
          type: 'sql',
          content: 'SELECT 1',
          order: 0,
          output: {
            viewMode: 'chart',
            chartConfig: {
              ...DEFAULT_CHART_CONFIG,
              xAxisColumn: 'name',
              yAxisColumn: 'value',
            },
          },
        },
      ],
    });

    const result = notebookToSqlnb(notebook, '0.7.0');

    expect(result.cells[0].output).toBeDefined();
    expect(result.cells[0].output?.viewMode).toBe('chart');
    expect(result.cells[0].output?.chartConfig?.xAxisColumn).toBe('name');
    expect(result.cells[0].output?.chartConfig?.yAxisColumn).toBe('value');
  });

  it('should not include name for cells without @name annotation', () => {
    const notebook = makeNotebook({
      cells: [
        { id: 'cell-1' as CellId, type: 'sql', content: 'SELECT 1', order: 0 },
      ],
    });
    const result = notebookToSqlnb(notebook, '0.7.0');

    expect(result.cells[0].name).toBeUndefined();
  });

  it('should not include name for markdown cells', () => {
    const notebook = makeNotebook({
      cells: [
        { id: 'cell-1' as CellId, type: 'markdown', content: '-- @name: test\nHello', order: 0 },
      ],
    });
    const result = notebookToSqlnb(notebook, '0.7.0');

    expect(result.cells[0].name).toBeUndefined();
  });

  it('should handle empty notebook (no cells)', () => {
    const notebook = makeNotebook({ cells: [] });
    const result = notebookToSqlnb(notebook, '0.7.0');

    expect(result.cells).toHaveLength(0);
  });
});

describe('parseSqlnb', () => {
  it('should parse valid .sqlnb JSON', () => {
    const input: SqlnbFormat = {
      version: 1,
      name: 'My Notebook',
      cells: [
        { type: 'sql', content: 'SELECT 1' },
        { type: 'markdown', content: '# Hello' },
      ],
      metadata: {
        createdAt: '2026-01-01T00:00:00.000Z',
        pondpilotVersion: '0.7.0',
      },
    };
    const result = parseSqlnb(JSON.stringify(input));

    expect(result.version).toBe(1);
    expect(result.name).toBe('My Notebook');
    expect(result.cells).toHaveLength(2);
    expect(result.cells[0].type).toBe('sql');
    expect(result.cells[1].type).toBe('markdown');
  });

  it('should reject invalid JSON', () => {
    expect(() => parseSqlnb('not json')).toThrow('Invalid JSON');
  });

  it('should reject non-object root', () => {
    expect(() => parseSqlnb('"string"')).toThrow('root must be a JSON object');
    expect(() => parseSqlnb('[]')).toThrow('root must be a JSON object');
    expect(() => parseSqlnb('null')).toThrow('root must be a JSON object');
  });

  it('should reject unsupported version', () => {
    expect(() =>
      parseSqlnb(JSON.stringify({ version: 2, name: 'x', cells: [], metadata: {} })),
    ).toThrow('Unsupported .sqlnb version: 2');
  });

  it('should reject missing or empty name', () => {
    expect(() =>
      parseSqlnb(JSON.stringify({ version: 1, name: '', cells: [], metadata: {} })),
    ).toThrow('"name" must be a non-empty string');
    expect(() =>
      parseSqlnb(JSON.stringify({ version: 1, name: 123, cells: [], metadata: {} })),
    ).toThrow('"name" must be a non-empty string');
  });

  it('should reject missing cells array', () => {
    expect(() =>
      parseSqlnb(JSON.stringify({ version: 1, name: 'x', metadata: {} })),
    ).toThrow('"cells" must be an array');
  });

  it('should reject cell with invalid type', () => {
    expect(() =>
      parseSqlnb(
        JSON.stringify({
          version: 1,
          name: 'x',
          cells: [{ type: 'python', content: '' }],
          metadata: {},
        }),
      ),
    ).toThrow('cell at index 0 has invalid type "python"');
  });

  it('should reject cell with non-string content', () => {
    expect(() =>
      parseSqlnb(
        JSON.stringify({
          version: 1,
          name: 'x',
          cells: [{ type: 'sql', content: 123 }],
          metadata: {},
        }),
      ),
    ).toThrow('cell at index 0 has invalid content');
  });

  it('should accept cells with optional name field', () => {
    const input = {
      version: 1,
      name: 'x',
      cells: [{ type: 'sql', content: 'SELECT 1', name: 'my_view' }],
      metadata: { createdAt: '', pondpilotVersion: '0.7.0' },
    };
    const result = parseSqlnb(JSON.stringify(input));
    expect(result.cells[0].name).toBe('my_view');
  });

  it('should accept cells with optional output field', () => {
    const input = {
      version: 1,
      name: 'x',
      cells: [
        {
          type: 'sql',
          content: 'SELECT 1',
          output: {
            viewMode: 'chart',
            chartConfig: {
              xAxisColumn: 'name',
              yAxisColumn: 'value',
            },
          },
        },
      ],
      metadata: { createdAt: '', pondpilotVersion: '0.7.0' },
    };
    const result = parseSqlnb(JSON.stringify(input));
    expect(result.cells[0].output?.viewMode).toBe('chart');
    expect(result.cells[0].output?.chartConfig?.xAxisColumn).toBe('name');
  });

  it('should reject cell with invalid output.viewMode', () => {
    expect(() =>
      parseSqlnb(
        JSON.stringify({
          version: 1,
          name: 'x',
          cells: [
            {
              type: 'sql',
              content: '',
              output: { viewMode: 'graph' },
            },
          ],
          metadata: {},
        }),
      ),
    ).toThrow('invalid output.viewMode');
  });

  it('should reject cell with non-string name', () => {
    expect(() =>
      parseSqlnb(
        JSON.stringify({
          version: 1,
          name: 'x',
          cells: [{ type: 'sql', content: '', name: 123 }],
          metadata: {},
        }),
      ),
    ).toThrow('cell at index 0 has invalid name');
  });

  it('should handle round-trip (serialize then parse)', () => {
    const notebook = makeNotebook();
    const serialized = notebookToSqlnb(notebook, '0.7.0');
    const json = JSON.stringify(serialized);
    const parsed = parseSqlnb(json);

    expect(parsed.name).toBe(notebook.name);
    expect(parsed.cells).toHaveLength(notebook.cells.length);
    expect(parsed.cells[0].content).toBe(notebook.cells[0].content);
    expect(parsed.cells[1].content).toBe(notebook.cells[1].content);
  });
});

describe('sqlnbCellsToNotebookCells', () => {
  it('should convert sqlnb cells to NotebookCell array with sequential order', () => {
    let counter = 0;
    const makeCellId = () => {
      const id = `cell-${counter}` as CellId;
      counter += 1;
      return id;
    };

    const sqlnbCells = [
      { type: 'sql' as const, content: 'SELECT 1' },
      { type: 'markdown' as const, content: '# Hello' },
      { type: 'sql' as const, content: 'SELECT 2' },
    ];

    const result = sqlnbCellsToNotebookCells(sqlnbCells, makeCellId);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('cell-0');
    expect(result[0].type).toBe('sql');
    expect(result[0].content).toBe('SELECT 1');
    expect(result[0].order).toBe(0);
    expect(result[0].output?.viewMode).toBe('table');
    expect(result[1].id).toBe('cell-1');
    expect(result[1].order).toBe(1);
    expect(result[2].id).toBe('cell-2');
    expect(result[2].order).toBe(2);
    expect(result[2].output?.viewMode).toBe('table');
  });

  it('should preserve sqlnb name metadata by injecting @name annotation', () => {
    const result = sqlnbCellsToNotebookCells(
      [{ type: 'sql' as const, content: 'SELECT * FROM x', name: 'my_view' }],
      () => 'cell-0' as CellId,
    );

    expect(result[0].content).toBe('-- @name: my_view\nSELECT * FROM x');
  });

  it('should override an existing @name annotation with sqlnb metadata name', () => {
    const result = sqlnbCellsToNotebookCells(
      [{ type: 'sql' as const, content: '-- @name: old_name\nSELECT * FROM x', name: 'new_name' }],
      () => 'cell-0' as CellId,
    );

    expect(result[0].content).toBe('-- @name: new_name\nSELECT * FROM x');
  });

  it('should handle empty cell array', () => {
    const result = sqlnbCellsToNotebookCells([], () => 'id' as CellId);
    expect(result).toHaveLength(0);
  });

  it('should preserve provided output settings for SQL cells', () => {
    const result = sqlnbCellsToNotebookCells(
      [
        {
          type: 'sql' as const,
          content: 'SELECT 1',
          output: {
            viewMode: 'chart',
            chartConfig: {
              ...DEFAULT_CHART_CONFIG,
              xAxisColumn: 'name',
            },
          },
        },
      ],
      () => 'cell-0' as CellId,
    );

    expect(result[0].output?.viewMode).toBe('chart');
    expect(result[0].output?.chartConfig?.xAxisColumn).toBe('name');
  });
});

describe('notebookToHtml', () => {
  it('should generate valid HTML with notebook title', () => {
    const notebook = makeNotebook();
    const html = notebookToHtml(notebook);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Test Notebook</title>');
    expect(html).toContain('Test Notebook');
  });

  it('should render SQL cells with code blocks', () => {
    const notebook = makeNotebook({
      cells: [
        { id: 'c1' as CellId, type: 'sql', content: 'SELECT * FROM users', order: 0 },
      ],
    });
    const html = notebookToHtml(notebook);

    expect(html).toContain('sql-cell');
    expect(html).toContain('SELECT * FROM users');
    expect(html).toContain('<pre');
    expect(html).toContain('<code>');
  });

  it('should render markdown cells', () => {
    const notebook = makeNotebook({
      cells: [
        { id: 'c1' as CellId, type: 'markdown', content: '## Hello World', order: 0 },
      ],
    });
    const html = notebookToHtml(notebook);

    expect(html).toContain('markdown-cell');
    expect(html).toContain('markdown-content');
  });

  it('should escape HTML in cell content', () => {
    const notebook = makeNotebook({
      cells: [
        { id: 'c1' as CellId, type: 'sql', content: 'SELECT "<script>" FROM t', order: 0 },
      ],
    });
    const html = notebookToHtml(notebook);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('should include PondPilot footer', () => {
    const notebook = makeNotebook();
    const html = notebookToHtml(notebook);

    expect(html).toContain('Generated by');
    expect(html).toContain('PondPilot');
  });

  it('should include dark mode support', () => {
    const notebook = makeNotebook();
    const html = notebookToHtml(notebook);

    expect(html).toContain('prefers-color-scheme: dark');
  });

  it('should include cell numbers', () => {
    const notebook = makeNotebook();
    const html = notebookToHtml(notebook);

    expect(html).toContain('Cell 1');
    expect(html).toContain('Cell 2');
  });

  it('should handle empty notebook', () => {
    const notebook = makeNotebook({ cells: [] });
    const html = notebookToHtml(notebook);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('0 cells');
  });
});
