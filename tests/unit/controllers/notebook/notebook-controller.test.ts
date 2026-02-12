/* eslint-disable import/order, import/first */
// Module-under-test imports must come after jest.mock calls for proper mock hoisting.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DEFAULT_CHART_CONFIG } from '@models/chart';
import { CellId, Notebook, NotebookId, normalizeNotebookCellOutput } from '@models/notebook';

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
  makeNotebookId: jest.fn(() => 'mock-notebook-id'),
}));

import { updateCellOutput } from '@controllers/notebook/notebook-controller';

describe('notebook-controller/updateCellOutput', () => {
  const notebookId = 'notebook-1' as NotebookId;
  const sqlCellId = 'cell-sql-1' as CellId;
  const markdownCellId = 'cell-md-1' as CellId;

  const defaultOutput = normalizeNotebookCellOutput();

  const baseNotebook: Notebook = {
    id: notebookId,
    name: 'Notebook',
    cells: [
      {
        id: sqlCellId,
        type: 'sql',
        content: 'SELECT 1',
        order: 0,
        output: defaultOutput,
      },
      {
        id: markdownCellId,
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
          ? { ...cell, output: normalizeNotebookCellOutput(cell.output) }
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
    updateCellOutput(
      notebookId,
      sqlCellId,
      { chartConfig: { xAxisColumn: 'name' } as any },
    );

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
