import { CellId, NotebookCellType } from '@models/notebook';
import { useCallback, useEffect, useRef } from 'react';

export type CellMode = 'command' | 'edit';

interface UseNotebookKeyboardOptions {
  /** Sorted cell IDs in display order */
  cellIds: CellId[];
  /** Currently active cell ID */
  activeCellId: CellId | null;
  /** Current cell mode */
  cellMode: CellMode;
  /** Whether the notebook tab is active */
  isTabActive: boolean;
  /** Callbacks for cell operations */
  onActiveCellChange: (cellId: CellId) => void;
  onRunCell: (cellId: CellId) => void;
  onAddCell: (type: NotebookCellType, afterCellId?: CellId) => void;
  onDeleteCell: (cellId: CellId) => void;
  onConvertCellType: (cellId: CellId, type: NotebookCellType) => void;
  onEnterEditMode: () => void;
  /** Get the type of a cell by its ID */
  getCellType: (cellId: CellId) => NotebookCellType | undefined;
}

/**
 * Handles Jupyter-style keyboard navigation in command mode.
 *
 * Command mode shortcuts:
 * - Enter -> edit mode (cursor in editor)
 * - Shift+Enter -> run current cell and advance
 * - ArrowUp/k -> navigate to previous cell
 * - ArrowDown/j -> navigate to next cell
 * - A -> add cell above
 * - B -> add cell below
 * - DD (double-tap D) -> delete cell
 * - M -> convert to markdown
 * - Y -> convert to SQL
 */
export function useNotebookKeyboard(options: UseNotebookKeyboardOptions) {
  const {
    cellIds,
    activeCellId,
    cellMode,
    isTabActive,
    onActiveCellChange,
    onRunCell,
    onAddCell,
    onDeleteCell,
    onConvertCellType,
    onEnterEditMode,
    getCellType,
  } = options;

  const lastDKeyTime = useRef<number>(0);
  const DD_THRESHOLD_MS = 400;

  const activeCellIndex = activeCellId ? cellIds.indexOf(activeCellId) : -1;

  const navigateToCell = useCallback(
    (direction: 'up' | 'down') => {
      if (activeCellIndex === -1 || cellIds.length === 0) return;

      const newIndex =
        direction === 'up'
          ? Math.max(0, activeCellIndex - 1)
          : Math.min(cellIds.length - 1, activeCellIndex + 1);

      if (newIndex !== activeCellIndex) {
        onActiveCellChange(cellIds[newIndex]);
      }
    },
    [activeCellIndex, cellIds, onActiveCellChange],
  );

  const runCellAndAdvance = useCallback(() => {
    if (!activeCellId) return;

    const cellType = getCellType(activeCellId);
    if (cellType === 'sql') {
      onRunCell(activeCellId);
    }

    // Advance to next cell, or create new one if at end
    if (activeCellIndex < cellIds.length - 1) {
      onActiveCellChange(cellIds[activeCellIndex + 1]);
    } else {
      onAddCell('sql', activeCellId);
    }
    onEnterEditMode();
  }, [
    activeCellId,
    activeCellIndex,
    cellIds,
    getCellType,
    onRunCell,
    onActiveCellChange,
    onAddCell,
    onEnterEditMode,
  ]);

  // Handle keydown events when in command mode
  useEffect(() => {
    if (!isTabActive || cellMode !== 'command') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeCellId) return;

      // Ignore if typing in an input/textarea (e.g. notebook name editing)
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case 'Enter':
          if (e.shiftKey) {
            e.preventDefault();
            runCellAndAdvance();
          } else {
            e.preventDefault();
            onEnterEditMode();
          }
          break;

        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          navigateToCell('up');
          break;

        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          navigateToCell('down');
          break;

        case 'a':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            const prevCellId =
              activeCellIndex > 0 ? cellIds[activeCellIndex - 1] : undefined;
            onAddCell('sql', prevCellId);
          }
          break;

        case 'b':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onAddCell('sql', activeCellId);
          }
          break;

        case 'd':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            const now = Date.now();
            if (now - lastDKeyTime.current < DD_THRESHOLD_MS) {
              onDeleteCell(activeCellId);
              lastDKeyTime.current = 0;
            } else {
              lastDKeyTime.current = now;
            }
          }
          break;

        case 'm':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onConvertCellType(activeCellId, 'markdown');
          }
          break;

        case 'y':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onConvertCellType(activeCellId, 'sql');
          }
          break;

        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isTabActive,
    cellMode,
    activeCellId,
    activeCellIndex,
    cellIds,
    navigateToCell,
    onAddCell,
    onConvertCellType,
    onDeleteCell,
    onEnterEditMode,
    runCellAndAdvance,
  ]);
}
