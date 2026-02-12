import {
  reorderCells,
  insertCellAfter,
  insertCellAtStart,
  removeCellImpl,
  swapCellOrder,
} from '@controllers/notebook/pure';
import { describe, expect, it } from '@jest/globals';
import { CellId } from '@models/notebook';

// Test helpers
function makeCell(
  id: string,
  order: number,
  type: 'sql' | 'markdown' = 'sql',
) {
  return {
    id: id as CellId,
    type,
    content: `content-${id}`,
    order,
  };
}

describe('cell operations for keyboard navigation', () => {
  describe('insertCellAfter (B shortcut)', () => {
    it('inserts cell after specified position', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1), makeCell('c', 2)];
      const newCell = makeCell('new', 0);

      const result = insertCellAfter(cells, newCell, 'a' as CellId);

      expect(result).toHaveLength(4);
      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('new');
      expect(result[2].id).toBe('b');
      expect(result[3].id).toBe('c');
      // Orders should be sequential
      result.forEach((cell, i) => expect(cell.order).toBe(i));
    });

    it('inserts cell at end when no afterCellId', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1)];
      const newCell = makeCell('new', 0);

      const result = insertCellAfter(cells, newCell);

      expect(result).toHaveLength(3);
      expect(result[2].id).toBe('new');
    });

    it('inserts at end when afterCellId is undefined', () => {
      const cells = [makeCell('a', 0)];
      const newCell = makeCell('new', 0);

      const result = insertCellAfter(cells, newCell);

      expect(result).toHaveLength(2);
      expect(result[1].id).toBe('new');
    });
  });

  describe('insertCellAtStart (A shortcut on first cell)', () => {
    it('inserts cell before all existing cells', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1), makeCell('c', 2)];
      const newCell = makeCell('new', 0);

      const result = insertCellAtStart(cells, newCell);

      expect(result).toHaveLength(4);
      expect(result[0].id).toBe('new');
      expect(result[1].id).toBe('a');
      expect(result[2].id).toBe('b');
      expect(result[3].id).toBe('c');
      result.forEach((cell, i) => expect(cell.order).toBe(i));
    });

    it('inserts before single cell', () => {
      const cells = [makeCell('a', 0)];
      const newCell = makeCell('new', 0);

      const result = insertCellAtStart(cells, newCell);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('new');
      expect(result[1].id).toBe('a');
    });

    it('handles unsorted input cells', () => {
      const cells = [makeCell('b', 1), makeCell('a', 0)];
      const newCell = makeCell('new', 0);

      const result = insertCellAtStart(cells, newCell);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('new');
      expect(result[1].id).toBe('a');
      expect(result[2].id).toBe('b');
    });
  });

  describe('removeCellImpl (DD shortcut)', () => {
    it('removes specified cell', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1), makeCell('c', 2)];

      const result = removeCellImpl(cells, 'b' as CellId);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('c');
      // Orders should be re-assigned sequentially
      result.forEach((cell, i) => expect(cell.order).toBe(i));
    });

    it('handles removing first cell', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1)];

      const result = removeCellImpl(cells, 'a' as CellId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('b');
      expect(result[0].order).toBe(0);
    });

    it('handles removing last cell', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1)];

      const result = removeCellImpl(cells, 'b' as CellId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a');
      expect(result[0].order).toBe(0);
    });

    it('returns original cells when ID not found', () => {
      const cells = [makeCell('a', 0)];

      const result = removeCellImpl(cells, 'nonexistent' as CellId);

      expect(result).toHaveLength(1);
    });
  });

  describe('swapCellOrder (move up/down shortcuts)', () => {
    it('moves cell up', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1), makeCell('c', 2)];

      const result = swapCellOrder(cells, 'b' as CellId, 'up');

      expect(result[0].id).toBe('b');
      expect(result[1].id).toBe('a');
      expect(result[2].id).toBe('c');
    });

    it('moves cell down', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1), makeCell('c', 2)];

      const result = swapCellOrder(cells, 'b' as CellId, 'down');

      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('c');
      expect(result[2].id).toBe('b');
    });

    it('does not move first cell up', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1)];

      const result = swapCellOrder(cells, 'a' as CellId, 'up');

      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('b');
    });

    it('does not move last cell down', () => {
      const cells = [makeCell('a', 0), makeCell('b', 1)];

      const result = swapCellOrder(cells, 'b' as CellId, 'down');

      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('b');
    });
  });

  describe('reorderCells', () => {
    it('sorts by order and assigns sequential values', () => {
      const cells = [makeCell('c', 2), makeCell('a', 0), makeCell('b', 1)];

      const result = reorderCells(cells);

      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('b');
      expect(result[2].id).toBe('c');
      result.forEach((cell, i) => expect(cell.order).toBe(i));
    });

    it('handles gaps in order values', () => {
      const cells = [makeCell('a', 0), makeCell('b', 5), makeCell('c', 10)];

      const result = reorderCells(cells);

      expect(result[0].order).toBe(0);
      expect(result[1].order).toBe(1);
      expect(result[2].order).toBe(2);
    });
  });
});

describe('undo cell deletion logic', () => {
  it('stores deleted cell data for restoration', () => {
    const cells = [makeCell('a', 0), makeCell('b', 1), makeCell('c', 2)];
    const cellToDelete = cells[1]; // cell 'b'
    const cellIndex = 1;
    const afterCellId = cellIndex > 0 ? cells[cellIndex - 1].id : undefined;

    // Save undo info
    const undoInfo = {
      cell: cellToDelete,
      afterCellId,
    };

    expect(undoInfo.cell.id).toBe('b');
    expect(undoInfo.afterCellId).toBe('a');

    // Restore: insert after the previous cell
    const remaining = removeCellImpl(cells, 'b' as CellId);
    const restored = insertCellAfter(
      remaining,
      undoInfo.cell,
      undoInfo.afterCellId,
    );

    expect(restored).toHaveLength(3);
    expect(restored[0].id).toBe('a');
    expect(restored[1].id).toBe('b');
    expect(restored[2].id).toBe('c');
  });

  it('handles undo of first cell deletion using insertCellAtStart', () => {
    const cells = [makeCell('a', 0), makeCell('b', 1)];
    const cellToDelete = cells[0];

    const remaining = removeCellImpl(cells, 'a' as CellId);
    const restored = insertCellAtStart(remaining, cellToDelete);

    expect(restored).toHaveLength(2);
    expect(restored[0].id).toBe('a');
    expect(restored[1].id).toBe('b');
    restored.forEach((cell, i) => expect(cell.order).toBe(i));
  });
});
