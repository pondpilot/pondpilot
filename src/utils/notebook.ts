import { CellId, CellRef, Notebook, NotebookId } from '@models/notebook';

import { makeIdFactory } from './new-id';

export const makeNotebookId = makeIdFactory<NotebookId>();

export const makeCellId = makeIdFactory<CellId>();

export const NOTEBOOK_CELL_REF_PREFIX = '__pp_cell_';

export const makeCellRef = (cellId: CellId): CellRef => {
  const normalizedId = String(cellId).replace(/-/g, '_');
  return `${NOTEBOOK_CELL_REF_PREFIX}${normalizedId}` as CellRef;
};

export const ensureCellRef = (cellId: CellId, ref?: CellRef): CellRef => ref ?? makeCellRef(cellId);

export function ensureNotebook(
  notebookOrId: Notebook | NotebookId,
  notebooks: Map<NotebookId, Notebook>,
): Notebook {
  if (typeof notebookOrId === 'string') {
    const fromState = notebooks.get(notebookOrId);

    if (!fromState) {
      throw new Error(`Notebook with id ${notebookOrId} not found`);
    }

    return fromState;
  }

  return notebookOrId;
}
