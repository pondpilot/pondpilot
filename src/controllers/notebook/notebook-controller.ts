// Public notebook controller API's
// By convention the order should follow CRUD groups!

import { persistDeleteTab } from '@controllers/tab/persist';
import { deleteTabImpl } from '@controllers/tab/pure';
import {
  CellId,
  Notebook,
  NotebookCell,
  NotebookCellExecution,
  NotebookCellExecutionPatch,
  NotebookCellOutputPatch,
  NotebookParameter,
  NotebookCellType,
  NotebookId,
  isNotebookCellExecutionEqual,
  isNotebookCellOutputEqual,
  isNotebookParametersEqual,
  normalizeNotebookCellExecution,
  normalizeNotebookCellOutput,
  normalizeNotebookParameters,
} from '@models/notebook';
import { NOTEBOOK_TABLE_NAME } from '@models/persisted-store';
import { TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { findUniqueName, getAllExistingNames } from '@utils/helpers';
import {
  ensureCellRef,
  ensureNotebook,
  makeCellId,
  makeCellRef,
  makeNotebookId,
  NOTEBOOK_CELL_REF_PREFIX,
} from '@utils/notebook';
import { SqlnbCell, sqlnbCellsToNotebookCells } from '@utils/notebook-export';
import { createPersistenceCatchHandler } from '@utils/persistence-logger';

import { persistDeleteNotebook } from './persist';
import {
  deleteNotebookImpl,
  insertCellAfter,
  insertCellAtStart,
  removeCellImpl,
  reorderCells,
  swapCellOrder,
} from './pure';

/**
 * Debounce timer for notebook persistence.
 * Keyed by NotebookId to allow independent debouncing per notebook.
 */
const persistTimers = new Map<NotebookId, ReturnType<typeof setTimeout>>();
const NOTEBOOK_SAVE_DEBOUNCE_MS = 300;

const normalizeCellName = (name?: string | null): string | null => {
  const trimmed = name?.trim();
  return trimmed || null;
};

const validateNotebookCellName = (name: string, existingLowercase: Set<string>): string | null => {
  if (!/^[a-zA-Z_]\w*$/.test(name)) {
    return `Invalid cell name "${name}": must be a valid SQL identifier (letters, digits, underscores, no leading digit)`;
  }
  if (name.startsWith(NOTEBOOK_CELL_REF_PREFIX)) {
    return `Cell name "${name}" cannot start with reserved prefix "${NOTEBOOK_CELL_REF_PREFIX}"`;
  }
  if (existingLowercase.has(name.toLowerCase())) {
    return `Cell name "${name}" is already used by another SQL cell`;
  }
  return null;
};

const normalizeNotebookCellIdentity = (cell: NotebookCell): NotebookCell => ({
  ...cell,
  ref: ensureCellRef(cell.id, cell.ref),
  name: cell.type === 'sql' ? normalizeCellName(cell.name) : null,
});

/**
 * Persists a notebook to IndexedDB, optionally debounced.
 */
const persistNotebook = (notebook: Notebook, debounce: boolean = false): void => {
  const iDb = useAppStore.getState()._iDbConn;
  if (!iDb) return;

  // Always cancel any pending debounced timer for this notebook to prevent
  // a stale closure from overwriting a newer immediate save.
  const existingTimer = persistTimers.get(notebook.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
    persistTimers.delete(notebook.id);
  }

  if (!debounce) {
    iDb
      .put(NOTEBOOK_TABLE_NAME, notebook, notebook.id)
      .catch(createPersistenceCatchHandler('persist notebook'));
    return;
  }

  const notebookId = notebook.id;
  const timer = setTimeout(() => {
    persistTimers.delete(notebookId);
    // Read the latest notebook from the store to avoid persisting a stale snapshot
    // captured by the closure.
    const currentNotebook = useAppStore.getState().notebooks.get(notebookId);
    if (!currentNotebook) return;
    iDb
      .put(NOTEBOOK_TABLE_NAME, currentNotebook, notebookId)
      .catch(createPersistenceCatchHandler('persist notebook (debounced)'));
  }, NOTEBOOK_SAVE_DEBOUNCE_MS);

  persistTimers.set(notebookId, timer);
};

/**
 * Updates a notebook in the store and optionally persists it.
 */
const updateNotebookInStore = (
  notebook: Notebook,
  action: string,
  debounce: boolean = false,
): void => {
  useAppStore.setState(
    (state) => ({
      notebooks: new Map(state.notebooks).set(notebook.id, notebook),
    }),
    undefined,
    action,
  );

  persistNotebook(notebook, debounce);
};

/**
 * ------------------------------------------------------------
 * -------------------------- Create --------------------------
 * ------------------------------------------------------------
 */

export const createNotebook = (name: string = 'notebook'): Notebook => {
  const { sqlScripts, comparisons, notebooks } = useAppStore.getState();

  const allExistingNames = getAllExistingNames({ comparisons, sqlScripts, notebooks });
  const uniqueName = findUniqueName(name, (value) => allExistingNames.has(value));

  const notebookId = makeNotebookId();
  const cellId = makeCellId();
  const now = new Date().toISOString();

  const notebook: Notebook = {
    id: notebookId,
    name: uniqueName,
    cells: [
      {
        id: cellId,
        ref: makeCellRef(cellId),
        name: null,
        type: 'sql',
        content: '',
        order: 0,
        output: normalizeNotebookCellOutput(),
        execution: normalizeNotebookCellExecution(),
      },
    ],
    parameters: [],
    createdAt: now,
    updatedAt: now,
  };

  updateNotebookInStore(notebook, 'AppStore/createNotebook');

  return notebook;
};

/**
 * Creates a notebook from imported .sqlnb data.
 */
export const createNotebookFromImport = (
  name: string,
  cells: SqlnbCell[],
  parameters?: NotebookParameter[],
): Notebook => {
  const { sqlScripts, comparisons, notebooks } = useAppStore.getState();

  const allExistingNames = getAllExistingNames({ comparisons, sqlScripts, notebooks });
  const uniqueName = findUniqueName(name, (value) => allExistingNames.has(value));

  const notebookId = makeNotebookId();
  const now = new Date().toISOString();

  const notebookCells =
    cells.length > 0
      ? sqlnbCellsToNotebookCells(cells, makeCellId, makeCellRef)
      : (() => {
          const emptyCellId = makeCellId();
          return [
            {
              id: emptyCellId,
              ref: makeCellRef(emptyCellId),
              name: null,
              type: 'sql' as const,
              content: '',
              order: 0,
              output: normalizeNotebookCellOutput(),
              execution: normalizeNotebookCellExecution(),
            },
          ];
        })();

  const notebook: Notebook = {
    id: notebookId,
    name: uniqueName,
    cells: notebookCells,
    parameters: normalizeNotebookParameters(parameters),
    createdAt: now,
    updatedAt: now,
  };

  updateNotebookInStore(notebook, 'AppStore/createNotebookFromImport');

  return notebook;
};

/**
 * Creates a deep copy of an existing notebook with a "(Copy)" suffix.
 */
export const duplicateNotebook = (notebookOrId: Notebook | NotebookId): Notebook => {
  const { notebooks, sqlScripts, comparisons } = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, notebooks);

  const allExistingNames = getAllExistingNames({ comparisons, sqlScripts, notebooks });
  const uniqueName = findUniqueName(`${notebook.name} (Copy)`, (value) =>
    allExistingNames.has(value),
  );

  const notebookId = makeNotebookId();
  const now = new Date().toISOString();

  const copiedCells: NotebookCell[] = notebook.cells.map((cell, index) => {
    const cellId = makeCellId();
    return {
      id: cellId,
      ref: makeCellRef(cellId),
      name: cell.type === 'sql' ? normalizeCellName(cell.name) : null,
      type: cell.type,
      content: cell.content,
      order: index,
      output: cell.type === 'sql' ? normalizeNotebookCellOutput(cell.output) : cell.output,
      execution:
        cell.type === 'sql' ? normalizeNotebookCellExecution(cell.execution) : cell.execution,
    };
  });

  const newNotebook: Notebook = {
    id: notebookId,
    name: uniqueName,
    cells:
      copiedCells.length > 0
        ? copiedCells
        : (() => {
            const fallbackCellId = makeCellId();
            return [
              {
                id: fallbackCellId,
                ref: makeCellRef(fallbackCellId),
                name: null,
                type: 'sql' as const,
                content: '',
                order: 0,
                output: normalizeNotebookCellOutput(),
                execution: normalizeNotebookCellExecution(),
              },
            ];
          })(),
    parameters: normalizeNotebookParameters(notebook.parameters),
    createdAt: now,
    updatedAt: now,
  };

  updateNotebookInStore(newNotebook, 'AppStore/duplicateNotebook');

  return newNotebook;
};

/**
 * ------------------------------------------------------------
 * -------------------------- Read ---------------------------
 * ------------------------------------------------------------
 */

/**
 * ------------------------------------------------------------
 * -------------------------- Update --------------------------
 * ------------------------------------------------------------
 */

export const renameNotebook = (notebookOrId: Notebook | NotebookId, newName: string): void => {
  const { notebooks, sqlScripts, comparisons } = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, notebooks);

  const allExistingNames = getAllExistingNames({
    comparisons,
    sqlScripts,
    notebooks,
    excludeId: notebook.id,
  });

  const uniqueName = findUniqueName(newName, (value) => allExistingNames.has(value));

  const updatedNotebook: Notebook = {
    ...notebook,
    name: uniqueName,
    updatedAt: new Date().toISOString(),
  };

  updateNotebookInStore(updatedNotebook, 'AppStore/renameNotebook');
};

export const updateNotebookCells = (
  notebookOrId: Notebook | NotebookId,
  cells: NotebookCell[],
): void => {
  const { notebooks } = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, notebooks);

  const updatedNotebook: Notebook = {
    ...notebook,
    cells: reorderCells(cells).map(normalizeNotebookCellIdentity),
    updatedAt: new Date().toISOString(),
  };

  updateNotebookInStore(updatedNotebook, 'AppStore/updateNotebookCells');
};

export const updateNotebookParameters = (
  notebookOrId: Notebook | NotebookId,
  parameters: NotebookParameter[],
): void => {
  const { notebooks } = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, notebooks);
  const currentParameters = normalizeNotebookParameters(notebook.parameters);
  const nextParameters = normalizeNotebookParameters(parameters);

  if (isNotebookParametersEqual(currentParameters, nextParameters)) {
    return;
  }

  const updatedNotebook: Notebook = {
    ...notebook,
    parameters: nextParameters,
    updatedAt: new Date().toISOString(),
  };

  updateNotebookInStore(updatedNotebook, 'AppStore/updateNotebookParameters');
};

/**
 * ------------------------------------------------------------
 * Cell Manipulation Helpers
 * ------------------------------------------------------------
 */

export const addCell = (
  notebookOrId: Notebook | NotebookId,
  type: NotebookCellType,
  afterCellId?: CellId,
): NotebookCell => {
  const { notebooks } = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, notebooks);
  const newCellId = makeCellId();

  const newCell: NotebookCell = {
    id: newCellId,
    ref: makeCellRef(newCellId),
    name: null,
    type,
    content: '',
    order: 0,
    output: type === 'sql' ? normalizeNotebookCellOutput() : undefined,
    execution: type === 'sql' ? normalizeNotebookCellExecution() : undefined,
  };

  const updatedCells = insertCellAfter(notebook.cells, newCell, afterCellId);

  const updatedNotebook: Notebook = {
    ...notebook,
    cells: updatedCells,
    updatedAt: new Date().toISOString(),
  };

  updateNotebookInStore(updatedNotebook, 'AppStore/addCell');

  return newCell;
};

export const addCellAtStart = (
  notebookOrId: Notebook | NotebookId,
  type: NotebookCellType,
): NotebookCell => {
  const { notebooks } = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, notebooks);
  const newCellId = makeCellId();

  const newCell: NotebookCell = {
    id: newCellId,
    ref: makeCellRef(newCellId),
    name: null,
    type,
    content: '',
    order: 0,
    output: type === 'sql' ? normalizeNotebookCellOutput() : undefined,
    execution: type === 'sql' ? normalizeNotebookCellExecution() : undefined,
  };

  const updatedCells = insertCellAtStart(notebook.cells, newCell);

  const updatedNotebook: Notebook = {
    ...notebook,
    cells: updatedCells,
    updatedAt: new Date().toISOString(),
  };

  updateNotebookInStore(updatedNotebook, 'AppStore/addCellAtStart');

  return newCell;
};

export const removeCell = (notebookOrId: Notebook | NotebookId, cellId: CellId): void => {
  const { notebooks } = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, notebooks);

  // Don't remove the last cell
  if (notebook.cells.length <= 1) return;

  const updatedCells = removeCellImpl(notebook.cells, cellId);

  const updatedNotebook: Notebook = {
    ...notebook,
    cells: updatedCells,
    updatedAt: new Date().toISOString(),
  };

  updateNotebookInStore(updatedNotebook, 'AppStore/removeCell');
};

export const moveCellUp = (notebookOrId: Notebook | NotebookId, cellId: CellId): void => {
  const { notebooks } = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, notebooks);

  const updatedCells = swapCellOrder(notebook.cells, cellId, 'up');

  const updatedNotebook: Notebook = {
    ...notebook,
    cells: updatedCells,
    updatedAt: new Date().toISOString(),
  };

  updateNotebookInStore(updatedNotebook, 'AppStore/moveCellUp');
};

export const moveCellDown = (notebookOrId: Notebook | NotebookId, cellId: CellId): void => {
  const { notebooks } = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, notebooks);

  const updatedCells = swapCellOrder(notebook.cells, cellId, 'down');

  const updatedNotebook: Notebook = {
    ...notebook,
    cells: updatedCells,
    updatedAt: new Date().toISOString(),
  };

  updateNotebookInStore(updatedNotebook, 'AppStore/moveCellDown');
};

export const updateCellContent = (
  notebookOrId: Notebook | NotebookId,
  cellId: CellId,
  content: string,
): void => {
  const { notebooks } = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, notebooks);

  const updatedCells = notebook.cells.map((cell) => {
    if (cell.id !== cellId) return normalizeNotebookCellIdentity(cell);
    return normalizeNotebookCellIdentity({ ...cell, content });
  });

  const updatedNotebook: Notebook = {
    ...notebook,
    cells: updatedCells,
    updatedAt: new Date().toISOString(),
  };

  // Use debounced persistence for cell content changes (user typing)
  updateNotebookInStore(updatedNotebook, 'AppStore/updateCellContent', true);
};

export type UpdateCellNameResult =
  | { success: true; name: string | null }
  | { success: false; error: string };

export const updateCellName = (
  notebookOrId: Notebook | NotebookId,
  cellId: CellId,
  name: string | null,
): UpdateCellNameResult => {
  const { notebooks } = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, notebooks);
  const normalizedName = normalizeCellName(name);
  const targetCell = notebook.cells.find((cell) => cell.id === cellId);

  if (!targetCell || targetCell.type !== 'sql') {
    return { success: false, error: 'Only SQL cells can have a name.' };
  }

  const existingNames = new Set(
    notebook.cells
      .filter((cell) => cell.type === 'sql' && cell.id !== cellId)
      .map((cell) => normalizeCellName(cell.name))
      .filter((value): value is string => !!value)
      .map((value) => value.toLowerCase()),
  );

  if (normalizedName) {
    const validationError = validateNotebookCellName(normalizedName, existingNames);
    if (validationError) {
      return { success: false, error: validationError };
    }
  }

  if (normalizeCellName(targetCell.name) === normalizedName) {
    return { success: true, name: normalizedName };
  }

  const updatedCells = notebook.cells.map((cell) =>
    cell.id === cellId
      ? normalizeNotebookCellIdentity({ ...cell, name: normalizedName })
      : normalizeNotebookCellIdentity(cell),
  );

  const updatedNotebook: Notebook = {
    ...notebook,
    cells: updatedCells,
    updatedAt: new Date().toISOString(),
  };

  updateNotebookInStore(updatedNotebook, 'AppStore/updateCellName');
  return { success: true, name: normalizedName };
};

export type NotebookCellContentPatch = {
  cellId: CellId;
  content: string;
};

export const applyNotebookCellContentPatches = (
  notebookOrId: Notebook | NotebookId,
  patches: NotebookCellContentPatch[],
): number => {
  if (patches.length === 0) return 0;

  const { notebooks } = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, notebooks);
  const patchMap = new Map<CellId, string>(patches.map((patch) => [patch.cellId, patch.content]));
  let changedCount = 0;

  const updatedCells = notebook.cells.map((cell) => {
    const nextContent = patchMap.get(cell.id);
    if (nextContent === undefined || nextContent === cell.content) {
      return normalizeNotebookCellIdentity(cell);
    }

    changedCount += 1;
    return normalizeNotebookCellIdentity({
      ...cell,
      content: nextContent,
    });
  });

  if (changedCount === 0) return 0;

  const updatedNotebook: Notebook = {
    ...notebook,
    cells: updatedCells,
    updatedAt: new Date().toISOString(),
  };

  updateNotebookInStore(updatedNotebook, 'AppStore/applyNotebookCellContentPatches');
  return changedCount;
};

export const updateCellType = (
  notebookOrId: Notebook | NotebookId,
  cellId: CellId,
  type: NotebookCellType,
): void => {
  const { notebooks } = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, notebooks);

  const updatedCells = notebook.cells.map((cell) => {
    if (cell.id !== cellId) return normalizeNotebookCellIdentity(cell);

    const updated = {
      ...cell,
      type,
      name: type === 'sql' ? normalizeCellName(cell.name) : null,
      output: type === 'sql' ? normalizeNotebookCellOutput(cell.output) : cell.output,
      execution: type === 'sql' ? normalizeNotebookCellExecution(cell.execution) : cell.execution,
    } as NotebookCell;

    return normalizeNotebookCellIdentity(updated);
  });

  const updatedNotebook: Notebook = {
    ...notebook,
    cells: updatedCells,
    updatedAt: new Date().toISOString(),
  };

  updateNotebookInStore(updatedNotebook, 'AppStore/updateCellType');
};

export const updateCellOutput = (
  notebookOrId: Notebook | NotebookId,
  cellId: CellId,
  output: NotebookCellOutputPatch,
): void => {
  const { notebooks } = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, notebooks);

  let changed = false;
  const updatedCells = notebook.cells.map((cell) => {
    if (cell.id !== cellId || cell.type !== 'sql') return cell;
    const currentOutput = normalizeNotebookCellOutput(cell.output);
    const nextOutput = normalizeNotebookCellOutput({
      ...currentOutput,
      ...output,
      chartConfig: {
        ...currentOutput.chartConfig,
        ...(output.chartConfig ?? {}),
      },
    });

    if (isNotebookCellOutputEqual(currentOutput, nextOutput)) {
      return cell;
    }

    changed = true;
    return { ...cell, output: nextOutput };
  });

  if (!changed) return;

  const updatedNotebook: Notebook = {
    ...notebook,
    cells: updatedCells,
    updatedAt: new Date().toISOString(),
  };

  updateNotebookInStore(updatedNotebook, 'AppStore/updateCellOutput');
};

export const updateCellExecution = (
  notebookOrId: Notebook | NotebookId,
  cellId: CellId,
  execution: NotebookCellExecutionPatch,
): void => {
  const { notebooks } = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, notebooks);

  let changed = false;
  const updatedCells = notebook.cells.map((cell) => {
    if (cell.id !== cellId || cell.type !== 'sql') return cell;

    const currentExecution = normalizeNotebookCellExecution(cell.execution);
    const nextExecution: NotebookCellExecution = normalizeNotebookCellExecution({
      ...currentExecution,
      ...execution,
      snapshot: execution.snapshot === undefined ? currentExecution.snapshot : execution.snapshot,
    });

    if (isNotebookCellExecutionEqual(currentExecution, nextExecution)) {
      return cell;
    }

    changed = true;
    return { ...cell, execution: nextExecution };
  });

  if (!changed) return;

  const updatedNotebook: Notebook = {
    ...notebook,
    cells: updatedCells,
    updatedAt: new Date().toISOString(),
  };

  updateNotebookInStore(updatedNotebook, 'AppStore/updateCellExecution');
};

export const clearNotebookCellExecutions = (notebookOrId: Notebook | NotebookId): void => {
  const { notebooks } = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, notebooks);

  let changed = false;
  const updatedCells = notebook.cells.map((cell) => {
    if (cell.type !== 'sql') return cell;

    const nextExecution = normalizeNotebookCellExecution();
    const currentExecution = normalizeNotebookCellExecution(cell.execution);
    if (isNotebookCellExecutionEqual(currentExecution, nextExecution)) {
      return cell;
    }

    changed = true;
    return { ...cell, execution: nextExecution };
  });

  if (!changed) return;

  const updatedNotebook: Notebook = {
    ...notebook,
    cells: updatedCells,
    updatedAt: new Date().toISOString(),
  };

  updateNotebookInStore(updatedNotebook, 'AppStore/clearNotebookCellExecutions');
};

/**
 * ------------------------------------------------------------
 * -------------------------- Delete --------------------------
 * ------------------------------------------------------------
 */

export const deleteNotebooks = async (notebookIds: Iterable<NotebookId>) => {
  const {
    notebooks,
    notebookAccessTimes,
    tabs,
    tabOrder,
    activeTabId,
    previewTabId,
    _iDbConn: iDbConn,
  } = useAppStore.getState();

  const idArray = Array.from(notebookIds);
  const idsToDeleteSet = new Set(idArray);

  // Clear any pending debounced persist timers to prevent zombie persistence
  for (const id of idArray) {
    const timer = persistTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      persistTimers.delete(id);
    }
  }

  const newNotebooks = deleteNotebookImpl(idArray, notebooks);

  // Find and delete associated notebook tabs.
  const tabsToDelete: TabId[] = [];
  for (const [tabId, tab] of tabs.entries()) {
    if (tab.type === 'notebook' && idsToDeleteSet.has(tab.notebookId)) {
      tabsToDelete.push(tabId);
    }
  }

  let newTabs = tabs;
  let newTabOrder = tabOrder;
  let newActiveTabId = activeTabId;
  let newPreviewTabId = previewTabId;

  if (tabsToDelete.length > 0) {
    const result = deleteTabImpl({
      deleteTabIds: tabsToDelete,
      tabs,
      tabOrder,
      activeTabId,
      previewTabId,
    });

    newTabs = result.newTabs;
    newTabOrder = result.newTabOrder;
    newActiveTabId = result.newActiveTabId;
    newPreviewTabId = result.newPreviewTabId;
  }

  const newNotebookAccessTimes = new Map(
    Array.from(notebookAccessTimes).filter(([id]) => !idsToDeleteSet.has(id)),
  );

  useAppStore.setState(
    {
      notebooks: newNotebooks,
      notebookAccessTimes: newNotebookAccessTimes,
      tabs: newTabs,
      tabOrder: newTabOrder,
      activeTabId: newActiveTabId,
      previewTabId: newPreviewTabId,
    },
    undefined,
    'AppStore/deleteNotebooks',
  );

  if (iDbConn) {
    persistDeleteNotebook(iDbConn, idArray);

    if (tabsToDelete.length) {
      persistDeleteTab(iDbConn, tabsToDelete, newActiveTabId, newPreviewTabId, newTabOrder);
    }
  }
};
