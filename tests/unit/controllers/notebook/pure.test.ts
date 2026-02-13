import {
  deleteNotebookImpl,
  insertCellAfter,
  removeCellImpl,
  reorderCells,
  swapCellOrder,
} from '@controllers/notebook/pure';
import { describe, it, expect } from '@jest/globals';
import { CellId, Notebook, NotebookCell, NotebookId } from '@models/notebook';

const makeCell = (id: string, order: number, type: 'sql' | 'markdown' = 'sql'): NotebookCell => ({
  id: id as CellId,
  ref: `__pp_cell_${id}` as any,
  name: null,
  type,
  content: `cell-${id}`,
  order,
});

const makeNotebook = (id: string, name: string): Notebook => ({
  id: id as NotebookId,
  name,
  cells: [makeCell('c1', 0)],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('notebook pure functions', () => {
  describe('reorderCells', () => {
    it('should assign sequential order values starting from 0', () => {
      const cells = [makeCell('a', 5), makeCell('b', 2), makeCell('c', 8)];
      const result = reorderCells(cells);

      expect(result.map((c) => c.order)).toEqual([0, 1, 2]);
      // Should be sorted by original order
      expect(result.map((c) => c.id)).toEqual(['b', 'a', 'c']);
    });

    it('should return new cell objects', () => {
      const cells = [makeCell('a', 0)];
      const result = reorderCells(cells);

      expect(result[0]).not.toBe(cells[0]);
      expect(result[0].id).toBe(cells[0].id);
    });

    it('should handle empty array', () => {
      expect(reorderCells([])).toEqual([]);
    });

    it('should handle single cell', () => {
      const cells = [makeCell('a', 3)];
      const result = reorderCells(cells);

      expect(result).toHaveLength(1);
      expect(result[0].order).toBe(0);
    });
  });

  describe('insertCellAfter', () => {
    it('should insert at end when no afterCellId is provided', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1)];
      const newCell = makeCell('c', 99);

      const result = insertCellAfter(cells, newCell);

      expect(result).toHaveLength(3);
      expect(result[2].id).toBe('c');
      expect(result.map((c) => c.order)).toEqual([0, 1, 2]);
    });

    it('should insert after specified cell', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1), makeCell('c', 2)];
      const newCell = makeCell('d', 99);

      const result = insertCellAfter(cells, newCell, 'a' as CellId);

      expect(result.map((c) => c.id)).toEqual(['a', 'd', 'b', 'c']);
      expect(result.map((c) => c.order)).toEqual([0, 1, 2, 3]);
    });

    it('should insert after the last cell', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1)];
      const newCell = makeCell('c', 99);

      const result = insertCellAfter(cells, newCell, 'b' as CellId);

      expect(result.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    });

    it('should insert at end if afterCellId is not found', () => {
      const cells = [makeCell('a', 0)];
      const newCell = makeCell('b', 99);

      const result = insertCellAfter(cells, newCell, 'nonexistent' as CellId);

      expect(result).toHaveLength(2);
      expect(result[1].id).toBe('b');
    });

    it('should work with empty cells array', () => {
      const newCell = makeCell('a', 0);
      const result = insertCellAfter([], newCell);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a');
      expect(result[0].order).toBe(0);
    });
  });

  describe('removeCellImpl', () => {
    it('should remove the specified cell', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1), makeCell('c', 2)];
      const result = removeCellImpl(cells, 'b' as CellId);

      expect(result).toHaveLength(2);
      expect(result.map((c) => c.id)).toEqual(['a', 'c']);
    });

    it('should reorder remaining cells', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1), makeCell('c', 2)];
      const result = removeCellImpl(cells, 'a' as CellId);

      expect(result.map((c) => c.order)).toEqual([0, 1]);
      expect(result.map((c) => c.id)).toEqual(['b', 'c']);
    });

    it('should return empty array when removing the only cell', () => {
      const cells = [makeCell('a', 0)];
      const result = removeCellImpl(cells, 'a' as CellId);

      expect(result).toHaveLength(0);
    });

    it('should return unchanged cells if cellId is not found', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1)];
      const result = removeCellImpl(cells, 'nonexistent' as CellId);

      expect(result).toHaveLength(2);
    });
  });

  describe('swapCellOrder', () => {
    it('should swap cell with the one above when direction is up', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1), makeCell('c', 2)];
      const result = swapCellOrder(cells, 'b' as CellId, 'up');

      expect(result.map((c) => c.id)).toEqual(['b', 'a', 'c']);
    });

    it('should swap cell with the one below when direction is down', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1), makeCell('c', 2)];
      const result = swapCellOrder(cells, 'b' as CellId, 'down');

      expect(result.map((c) => c.id)).toEqual(['a', 'c', 'b']);
    });

    it('should not change anything when moving first cell up', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1)];
      const result = swapCellOrder(cells, 'a' as CellId, 'up');

      expect(result.map((c) => c.id)).toEqual(['a', 'b']);
    });

    it('should not change anything when moving last cell down', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1)];
      const result = swapCellOrder(cells, 'b' as CellId, 'down');

      expect(result.map((c) => c.id)).toEqual(['a', 'b']);
    });

    it('should return original cells if cellId not found', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1)];
      const result = swapCellOrder(cells, 'nonexistent' as CellId, 'up');

      expect(result).toBe(cells);
    });

    it('should reorder after swap', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1), makeCell('c', 2)];
      const result = swapCellOrder(cells, 'c' as CellId, 'up');

      expect(result.map((c) => c.order)).toEqual([0, 1, 2]);
      expect(result.map((c) => c.id)).toEqual(['a', 'c', 'b']);
    });
  });

  describe('deleteNotebookImpl', () => {
    it('should remove specified notebooks from the map', () => {
      const notebooks = new Map<NotebookId, Notebook>([
        ['n1' as NotebookId, makeNotebook('n1', 'first')],
        ['n2' as NotebookId, makeNotebook('n2', 'second')],
        ['n3' as NotebookId, makeNotebook('n3', 'third')],
      ]);

      const result = deleteNotebookImpl(['n2' as NotebookId], notebooks);

      expect(result.size).toBe(2);
      expect(result.has('n1' as NotebookId)).toBe(true);
      expect(result.has('n2' as NotebookId)).toBe(false);
      expect(result.has('n3' as NotebookId)).toBe(true);
    });

    it('should handle deleting multiple notebooks', () => {
      const notebooks = new Map<NotebookId, Notebook>([
        ['n1' as NotebookId, makeNotebook('n1', 'first')],
        ['n2' as NotebookId, makeNotebook('n2', 'second')],
        ['n3' as NotebookId, makeNotebook('n3', 'third')],
      ]);

      const result = deleteNotebookImpl(['n1' as NotebookId, 'n3' as NotebookId], notebooks);

      expect(result.size).toBe(1);
      expect(result.has('n2' as NotebookId)).toBe(true);
    });

    it('should not mutate the original map', () => {
      const notebooks = new Map<NotebookId, Notebook>([
        ['n1' as NotebookId, makeNotebook('n1', 'first')],
      ]);

      deleteNotebookImpl(['n1' as NotebookId], notebooks);

      expect(notebooks.size).toBe(1);
    });

    it('should handle deleting non-existent IDs', () => {
      const notebooks = new Map<NotebookId, Notebook>([
        ['n1' as NotebookId, makeNotebook('n1', 'first')],
      ]);

      const result = deleteNotebookImpl(['nonexistent' as NotebookId], notebooks);

      expect(result.size).toBe(1);
    });

    it('should handle empty notebooks map', () => {
      const result = deleteNotebookImpl(['n1' as NotebookId], new Map());

      expect(result.size).toBe(0);
    });
  });
});
