/* eslint-disable import/order, import/first */
// Module-under-test imports must come after jest.mock calls for proper mock hoisting.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DEFAULT_CHART_CONFIG } from '@models/chart';
import {
  CellId,
  Notebook,
  NotebookId,
  normalizeNotebookCellExecution,
  normalizeNotebookCellOutput,
} from '@models/notebook';

let mockState: any;
let mockSetState: jest.Mock;

jest.mock('@store/app-store', () => ({
  useAppStore: {
    getState: () => mockState,
    setState: (...args: any[]) => mockSetState(...args),
  },
}));

jest.mock('@utils/notebook', () => ({
  ensureNotebook: jest.fn(
    (notebookOrId: Notebook | NotebookId, notebooks: Map<NotebookId, Notebook>) => {
      if (typeof notebookOrId === 'string') {
        const notebook = notebooks.get(notebookOrId);
        if (!notebook) {
          throw new Error(`Notebook not found: ${notebookOrId}`);
        }
        return notebook;
      }
      return notebookOrId;
    },
  ),
  makeCellId: jest.fn(() => 'mock-cell-id'),
  makeCellRef: jest.fn((cellId: string) => `__pp_cell_${cellId.replace(/-/g, '_')}`),
  makeNotebookId: jest.fn(() => 'mock-notebook-id'),
  ensureCellRef: jest.fn(
    (cellId: string, ref?: string) => ref ?? `__pp_cell_${cellId.replace(/-/g, '_')}`,
  ),
  NOTEBOOK_CELL_REF_PREFIX: '__pp_cell_',
}));

import {
  applyNotebookCellContentPatches,
  clearNotebookCellExecutions,
  updateCellName,
  updateCellExecution,
  updateCellOutput,
} from '@controllers/notebook/notebook-controller';

describe('notebook-controller/updateCellOutput', () => {
  const notebookId = 'notebook-1' as NotebookId;
  const sqlCellId = 'cell-sql-1' as CellId;
  const markdownCellId = 'cell-md-1' as CellId;

  const defaultOutput = normalizeNotebookCellOutput();
  const defaultExecution = normalizeNotebookCellExecution();

  const baseNotebook: Notebook = {
    id: notebookId,
    name: 'Notebook',
    cells: [
      {
        id: sqlCellId,
        ref: 'ref-sql-1' as any,
        name: null,
        type: 'sql',
        content: 'SELECT 1',
        order: 0,
        output: defaultOutput,
        execution: defaultExecution,
      },
      {
        id: markdownCellId,
        ref: 'ref-md-1' as any,
        name: null,
        type: 'markdown',
        content: '# Notes',
        order: 1,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    const notebookCopy: Notebook = {
      ...baseNotebook,
      cells: baseNotebook.cells.map((cell) =>
        cell.type === 'sql'
          ? {
              ...cell,
              output: normalizeNotebookCellOutput(cell.output),
              execution: normalizeNotebookCellExecution(cell.execution),
            }
          : { ...cell },
      ),
    };

    mockState = {
      notebooks: new Map([[notebookId, notebookCopy]]),
      _iDbConn: null,
    };

    mockSetState = jest.fn((updater: any) => {
      const partial = typeof updater === 'function' ? updater(mockState) : updater;
      mockState = { ...mockState, ...partial };
      return mockState;
    });
  });

  it('updates SQL cell output and stores the new chart mode/config', () => {
    const chartConfig = {
      ...DEFAULT_CHART_CONFIG,
      xAxisColumn: 'category',
      yAxisColumn: 'amount',
      chartType: 'line' as const,
    };

    updateCellOutput(notebookId, sqlCellId, {
      viewMode: 'chart',
      chartConfig,
    });

    expect(mockSetState).toHaveBeenCalledTimes(1);
    expect(mockSetState.mock.calls[0][2]).toBe('AppStore/updateCellOutput');

    const updatedNotebook = mockState.notebooks.get(notebookId) as Notebook;
    const updatedSqlCell = updatedNotebook.cells.find((c) => c.id === sqlCellId);

    expect(updatedSqlCell?.output?.viewMode).toBe('chart');
    expect(updatedSqlCell?.output?.chartConfig.chartType).toBe('line');
    expect(updatedSqlCell?.output?.chartConfig.xAxisColumn).toBe('category');
    expect(updatedSqlCell?.output?.chartConfig.yAxisColumn).toBe('amount');
  });

  it('merges partial chartConfig updates with existing output settings', () => {
    updateCellOutput(notebookId, sqlCellId, { chartConfig: { xAxisColumn: 'name' } as any });

    expect(mockSetState).toHaveBeenCalledTimes(1);

    const updatedNotebook = mockState.notebooks.get(notebookId) as Notebook;
    const updatedSqlCell = updatedNotebook.cells.find((c) => c.id === sqlCellId);

    expect(updatedSqlCell?.output?.chartConfig.xAxisColumn).toBe('name');
    expect(updatedSqlCell?.output?.chartConfig.yAxisColumn).toBe(
      defaultOutput.chartConfig.yAxisColumn,
    );
    expect(updatedSqlCell?.output?.viewMode).toBe(defaultOutput.viewMode);
  });

  it('does nothing when requested output matches existing output', () => {
    updateCellOutput(notebookId, sqlCellId, {
      viewMode: defaultOutput.viewMode,
      chartConfig: defaultOutput.chartConfig,
    });

    expect(mockSetState).not.toHaveBeenCalled();
  });

  it('does nothing for non-SQL cells', () => {
    updateCellOutput(notebookId, markdownCellId, {
      viewMode: 'chart',
      chartConfig: {
        ...DEFAULT_CHART_CONFIG,
        xAxisColumn: 'x',
        yAxisColumn: 'y',
      },
    });

    expect(mockSetState).not.toHaveBeenCalled();
  });
});

describe('notebook-controller/updateCellExecution', () => {
  const notebookId = 'notebook-1' as NotebookId;
  const sqlCellId = 'cell-sql-1' as CellId;

  beforeEach(() => {
    mockState = {
      notebooks: new Map([
        [
          notebookId,
          {
            id: notebookId,
            name: 'Notebook',
            cells: [
              {
                id: sqlCellId,
                ref: 'ref-sql-1' as any,
                name: null,
                type: 'sql',
                content: 'SELECT 1',
                order: 0,
                output: normalizeNotebookCellOutput(),
                execution: normalizeNotebookCellExecution(),
              },
            ],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          } satisfies Notebook,
        ],
      ]),
      _iDbConn: null,
    };

    mockSetState = jest.fn((updater: any) => {
      const partial = typeof updater === 'function' ? updater(mockState) : updater;
      mockState = { ...mockState, ...partial };
      return mockState;
    });
  });

  it('updates SQL cell execution and persists the action', () => {
    updateCellExecution(notebookId, sqlCellId, {
      status: 'success',
      lastQuery: 'SELECT 1',
      executionTime: 42,
      executionCount: 3,
      lastRunAt: '2026-02-12T09:00:00.000Z',
    });

    expect(mockSetState).toHaveBeenCalledTimes(1);
    expect(mockSetState.mock.calls[0][2]).toBe('AppStore/updateCellExecution');

    const updatedNotebook = mockState.notebooks.get(notebookId) as Notebook;
    const updatedSqlCell = updatedNotebook.cells.find((c) => c.id === sqlCellId);
    expect(updatedSqlCell?.execution?.status).toBe('success');
    expect(updatedSqlCell?.execution?.lastQuery).toBe('SELECT 1');
    expect(updatedSqlCell?.execution?.executionTime).toBe(42);
    expect(updatedSqlCell?.execution?.executionCount).toBe(3);
  });

  it('does nothing if execution state is unchanged', () => {
    updateCellExecution(notebookId, sqlCellId, {
      status: 'idle',
      error: null,
      executionTime: null,
      lastQuery: null,
      executionCount: null,
      lastRunAt: null,
      snapshot: null,
    });

    expect(mockSetState).not.toHaveBeenCalled();
  });

  it('clears execution state for all sql cells', () => {
    updateCellExecution(notebookId, sqlCellId, {
      status: 'success',
      lastQuery: 'SELECT 1',
      executionTime: 10,
      executionCount: 1,
      lastRunAt: '2026-02-12T09:00:00.000Z',
    });
    mockSetState.mockClear();

    clearNotebookCellExecutions(notebookId);

    expect(mockSetState).toHaveBeenCalledTimes(1);
    expect(mockSetState.mock.calls[0][2]).toBe('AppStore/clearNotebookCellExecutions');

    const updatedNotebook = mockState.notebooks.get(notebookId) as Notebook;
    const updatedSqlCell = updatedNotebook.cells.find((c) => c.id === sqlCellId);
    expect(updatedSqlCell?.execution).toEqual(normalizeNotebookCellExecution());
  });
});

describe('notebook-controller/updateCellName', () => {
  const notebookId = 'notebook-1' as NotebookId;
  const sqlCellId = 'cell-sql-1' as CellId;
  const otherSqlCellId = 'cell-sql-2' as CellId;

  beforeEach(() => {
    mockState = {
      notebooks: new Map([
        [
          notebookId,
          {
            id: notebookId,
            name: 'Notebook',
            cells: [
              {
                id: sqlCellId,
                ref: 'ref-sql-1' as any,
                name: 'source_alias',
                type: 'sql',
                content: 'SELECT 1',
                order: 0,
                output: normalizeNotebookCellOutput(),
                execution: normalizeNotebookCellExecution(),
              },
              {
                id: otherSqlCellId,
                ref: 'ref-sql-2' as any,
                name: 'other_alias',
                type: 'sql',
                content: 'SELECT 2',
                order: 1,
                output: normalizeNotebookCellOutput(),
                execution: normalizeNotebookCellExecution(),
              },
            ],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          } satisfies Notebook,
        ],
      ]),
      _iDbConn: null,
    };

    mockSetState = jest.fn((updater: any) => {
      const partial = typeof updater === 'function' ? updater(mockState) : updater;
      mockState = { ...mockState, ...partial };
      return mockState;
    });
  });

  it('updates SQL cell name when valid', () => {
    const result = updateCellName(notebookId, sqlCellId, 'renamed_alias');

    expect(result).toEqual({ success: true, name: 'renamed_alias' });
    expect(mockSetState).toHaveBeenCalledTimes(1);

    const updatedNotebook = mockState.notebooks.get(notebookId) as Notebook;
    const updatedCell = updatedNotebook.cells.find((cell) => cell.id === sqlCellId);
    expect(updatedCell?.name).toBe('renamed_alias');
  });

  it('rejects duplicate SQL aliases', () => {
    const result = updateCellName(notebookId, sqlCellId, 'other_alias');

    expect(result.success).toBe(false);
    expect(mockSetState).not.toHaveBeenCalled();
  });

  it('clears alias when null is provided', () => {
    const result = updateCellName(notebookId, sqlCellId, null);

    expect(result).toEqual({ success: true, name: null });
    const updatedNotebook = mockState.notebooks.get(notebookId) as Notebook;
    const updatedCell = updatedNotebook.cells.find((cell) => cell.id === sqlCellId);
    expect(updatedCell?.name).toBeNull();
  });
});

describe('notebook-controller/applyNotebookCellContentPatches', () => {
  const notebookId = 'notebook-1' as NotebookId;
  const sqlCellId = 'cell-sql-1' as CellId;
  const otherSqlCellId = 'cell-sql-2' as CellId;

  beforeEach(() => {
    mockState = {
      notebooks: new Map([
        [
          notebookId,
          {
            id: notebookId,
            name: 'Notebook',
            cells: [
              {
                id: sqlCellId,
                ref: 'ref-sql-1' as any,
                name: 'a',
                type: 'sql',
                content: 'SELECT * FROM a',
                order: 0,
                output: normalizeNotebookCellOutput(),
                execution: normalizeNotebookCellExecution(),
              },
              {
                id: otherSqlCellId,
                ref: 'ref-sql-2' as any,
                name: 'b',
                type: 'sql',
                content: 'SELECT * FROM a',
                order: 1,
                output: normalizeNotebookCellOutput(),
                execution: normalizeNotebookCellExecution(),
              },
            ],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          } satisfies Notebook,
        ],
      ]),
      _iDbConn: null,
    };

    mockSetState = jest.fn((updater: any) => {
      const partial = typeof updater === 'function' ? updater(mockState) : updater;
      mockState = { ...mockState, ...partial };
      return mockState;
    });
  });

  it('applies content patches and returns changed count', () => {
    const changed = applyNotebookCellContentPatches(notebookId, [
      { cellId: otherSqlCellId, content: 'SELECT * FROM renamed_alias' },
    ]);

    expect(changed).toBe(1);
    expect(mockSetState).toHaveBeenCalledTimes(1);

    const updatedNotebook = mockState.notebooks.get(notebookId) as Notebook;
    const updatedCell = updatedNotebook.cells.find((cell) => cell.id === otherSqlCellId);
    expect(updatedCell?.content).toBe('SELECT * FROM renamed_alias');
  });

  it('returns zero when there are no effective changes', () => {
    const changed = applyNotebookCellContentPatches(notebookId, [
      { cellId: otherSqlCellId, content: 'SELECT * FROM a' },
    ]);

    expect(changed).toBe(0);
    expect(mockSetState).not.toHaveBeenCalled();
  });
});
