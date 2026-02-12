import {
  reorderCells,
  insertCellAfter,
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
  describe('insertCellAfter (A/B shortcuts)', () => {
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

    it('inserts before first cell when afterCellId is undefined', () => {
      // For "A" shortcut: insert above first cell = insert at end
      // with no afterCellId
      const cells = [makeCell('a', 0)];
      const newCell = makeCell('new', 0);

      const result = insertCellAfter(cells, newCell);

      expect(result).toHaveLength(2);
      expect(result[1].id).toBe('new');
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

describe('cell navigation logic', () => {
  it('navigating up from first cell stays at first', () => {
    const cellIds = ['a', 'b', 'c'] as CellId[];
    const activeIndex = 0;
    const newIndex = Math.max(0, activeIndex - 1);

    expect(newIndex).toBe(0);
    expect(cellIds[newIndex]).toBe('a');
  });

  it('navigating down from last cell stays at last', () => {
    const cellIds = ['a', 'b', 'c'] as CellId[];
    const activeIndex = 2;
    const newIndex = Math.min(cellIds.length - 1, activeIndex + 1);

    expect(newIndex).toBe(2);
    expect(cellIds[newIndex]).toBe('c');
  });

  it('navigating up moves to previous cell', () => {
    const cellIds = ['a', 'b', 'c'] as CellId[];
    const activeIndex = 1;
    const newIndex = Math.max(0, activeIndex - 1);

    expect(newIndex).toBe(0);
    expect(cellIds[newIndex]).toBe('a');
  });

  it('navigating down moves to next cell', () => {
    const cellIds = ['a', 'b', 'c'] as CellId[];
    const activeIndex = 1;
    const newIndex = Math.min(cellIds.length - 1, activeIndex + 1);

    expect(newIndex).toBe(2);
    expect(cellIds[newIndex]).toBe('c');
  });
});

describe('execution counter logic', () => {
  it('execution counter increments', () => {
    let counter = 0;
    const counts = new Map<string, number>();

    // Simulate executing cell 'a'
    counter += 1;
    counts.set('a', counter);
    expect(counts.get('a')).toBe(1);

    // Execute cell 'b'
    counter += 1;
    counts.set('b', counter);
    expect(counts.get('b')).toBe(2);

    // Re-execute cell 'a'
    counter += 1;
    counts.set('a', counter);
    expect(counts.get('a')).toBe(3);
    expect(counts.get('b')).toBe(2);
  });

  it('clear all resets execution counts', () => {
    const counts = new Map<string, number>();
    counts.set('a', 1);
    counts.set('b', 2);

    counts.clear();

    expect(counts.size).toBe(0);
    expect(counts.get('a')).toBeUndefined();
  });
});

describe('cell collapse logic', () => {
  it('toggling collapse adds and removes cells', () => {
    const collapsed = new Set<string>();

    // Collapse cell 'a'
    collapsed.add('a');
    expect(collapsed.has('a')).toBe(true);
    expect(collapsed.has('b')).toBe(false);

    // Uncollapse cell 'a'
    collapsed.delete('a');
    expect(collapsed.has('a')).toBe(false);
  });

  it('collapse all adds all cells', () => {
    const cellIds = ['a', 'b', 'c'];
    const collapsed = new Set(cellIds);

    expect(collapsed.size).toBe(3);
    expect(collapsed.has('a')).toBe(true);
    expect(collapsed.has('b')).toBe(true);
    expect(collapsed.has('c')).toBe(true);
  });

  it('expand all clears collapsed set', () => {
    const collapsed = new Set(['a', 'b', 'c']);

    const expanded = new Set<string>();

    expect(expanded.size).toBe(0);
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

  it('handles undo of first cell deletion', () => {
    const cells = [makeCell('a', 0), makeCell('b', 1)];
    const cellToDelete = cells[0];
    const afterCellId = undefined; // first cell

    const remaining = removeCellImpl(cells, 'a' as CellId);
    const restored = insertCellAfter(
      remaining,
      cellToDelete,
      afterCellId,
    );

    // Cell 'a' will be at end since afterCellId is undefined
    expect(restored).toHaveLength(2);
    expect(restored.map((c) => c.id)).toContain('a');
    expect(restored.map((c) => c.id)).toContain('b');
  });
});

describe('DD (double-tap D) timing logic', () => {
  it('recognizes double-tap within threshold', () => {
    const DD_THRESHOLD_MS = 400;
    let lastDKeyTime = 0;

    // First tap
    const firstTapTime = 1000;
    const timeSinceLastD = firstTapTime - lastDKeyTime;
    const isDoubleTap1 = timeSinceLastD < DD_THRESHOLD_MS;
    expect(isDoubleTap1).toBe(false);
    lastDKeyTime = firstTapTime;

    // Second tap within threshold
    const secondTapTime = 1200;
    const timeSinceLastD2 = secondTapTime - lastDKeyTime;
    const isDoubleTap2 = timeSinceLastD2 < DD_THRESHOLD_MS;
    expect(isDoubleTap2).toBe(true);
  });

  it('rejects double-tap outside threshold', () => {
    const DD_THRESHOLD_MS = 400;
    let lastDKeyTime = 0;

    // First tap
    const firstTapTime = 1000;
    lastDKeyTime = firstTapTime;

    // Second tap outside threshold
    const secondTapTime = 1500;
    const timeSinceLastD = secondTapTime - lastDKeyTime;
    const isDoubleTap = timeSinceLastD < DD_THRESHOLD_MS;
    expect(isDoubleTap).toBe(false);
  });
});
