import { CellId, Notebook, NotebookId } from '@models/notebook';

import { makeIdFactory } from './new-id';

export const makeNotebookId = makeIdFactory<NotebookId>();

export const makeCellId = makeIdFactory<CellId>();

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
