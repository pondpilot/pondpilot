import { NewId } from './new-id';

export type NotebookId = NewId<'NotebookId'>;

export type CellId = NewId<'CellId'>;

export type NotebookCellType = 'sql' | 'markdown';

export type NotebookCell = {
  id: CellId;
  type: NotebookCellType;
  content: string;
  order: number;
};

export type Notebook = {
  id: NotebookId;
  name: string;
  cells: NotebookCell[];
  createdAt: string;
  updatedAt: string;
};
