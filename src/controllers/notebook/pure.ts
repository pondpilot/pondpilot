// Pure functions implementing notebook controller logic.

import { CellId, Notebook, NotebookCell, NotebookId } from '@models/notebook';

/**
 * Removes notebooks from the map.
 */
export const deleteNotebookImpl = (
  deleteNotebookIds: Iterable<NotebookId>,
  notebooks: Map<NotebookId, Notebook>,
): Map<NotebookId, Notebook> => {
  const deleteSet = new Set(deleteNotebookIds);

  return new Map(Array.from(notebooks).filter(([id]) => !deleteSet.has(id)));
};

/**
 * Assigns sequential order values (0, 1, 2...) to cells in their current array position.
 */
const assignOrder = (cells: NotebookCell[]): NotebookCell[] => {
  return cells.map((cell, index) => ({
    ...cell,
    order: index,
  }));
};

/**
 * Sorts cells by their order field and assigns clean sequential order values.
 */
export const reorderCells = (cells: NotebookCell[]): NotebookCell[] => {
  const sorted = [...cells].sort((a, b) => a.order - b.order);
  return assignOrder(sorted);
};

/**
 * Inserts a cell after the specified cell, or at the end if no afterCellId is provided.
 */
export const insertCellAfter = (
  cells: NotebookCell[],
  newCell: NotebookCell,
  afterCellId?: CellId,
): NotebookCell[] => {
  const sorted = [...cells].sort((a, b) => a.order - b.order);

  if (!afterCellId) {
    return assignOrder([...sorted, newCell]);
  }

  const afterIndex = sorted.findIndex((c) => c.id === afterCellId);
  if (afterIndex === -1) {
    return assignOrder([...sorted, newCell]);
  }

  const result = [...sorted.slice(0, afterIndex + 1), newCell, ...sorted.slice(afterIndex + 1)];
  return assignOrder(result);
};

/**
 * Inserts a cell at the beginning of the cell list (before all existing cells).
 */
export const insertCellAtStart = (cells: NotebookCell[], newCell: NotebookCell): NotebookCell[] => {
  const sorted = [...cells].sort((a, b) => a.order - b.order);
  return assignOrder([newCell, ...sorted]);
};

/**
 * Removes a cell from the list and reorders the remaining cells.
 */
export const removeCellImpl = (cells: NotebookCell[], cellId: CellId): NotebookCell[] => {
  const filtered = cells.filter((c) => c.id !== cellId);
  return reorderCells(filtered);
};

/**
 * Swaps a cell with its neighbor in the specified direction.
 */
export const swapCellOrder = (
  cells: NotebookCell[],
  cellId: CellId,
  direction: 'up' | 'down',
): NotebookCell[] => {
  const sorted = [...cells].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((c) => c.id === cellId);

  if (index === -1) return cells;
  if (direction === 'up' && index === 0) return cells;
  if (direction === 'down' && index === sorted.length - 1) return cells;

  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  const temp = sorted[index];
  sorted[index] = sorted[swapIndex];
  sorted[swapIndex] = temp;

  return assignOrder(sorted);
};
