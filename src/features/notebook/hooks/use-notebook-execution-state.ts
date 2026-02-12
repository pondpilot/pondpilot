import { useCallback, useRef, useState } from 'react';

export type CellExecutionStatus = 'idle' | 'running' | 'success' | 'error';

export type CellExecutionState = {
  status: CellExecutionStatus;
  error: string | null;
  executionTime: number | null;
  lastQuery: string | null;
};

const IDLE_STATE: CellExecutionState = {
  status: 'idle',
  error: null,
  executionTime: null,
  lastQuery: null,
};

/**
 * Manages execution state for all cells in a notebook,
 * including stale cell tracking for dependency indicators.
 *
 * Uses a Map<cellId, CellExecutionState> internally, and exposes
 * a version counter so consumers can subscribe to changes without
 * needing the full map in their dependency arrays.
 */
export function useNotebookExecutionState() {
  const stateRef = useRef(new Map<string, CellExecutionState>());
  const [version, setVersion] = useState(0);
  const [staleCells, setStaleCells] = useState<Set<string>>(new Set());

  const getCellState = useCallback(
    (cellId: string): CellExecutionState => {
      return stateRef.current.get(cellId) ?? IDLE_STATE;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version forces callback identity update on state changes
    [version],
  );

  const setCellState = useCallback((cellId: string, state: CellExecutionState) => {
    stateRef.current.set(cellId, state);
    // When a cell is re-executed successfully, it's no longer stale
    if (state.status === 'success' || state.status === 'running') {
      setStaleCells((prev) => {
        if (!prev.has(cellId)) return prev;
        const next = new Set(prev);
        next.delete(cellId);
        return next;
      });
    }
    setVersion((v) => v + 1);
  }, []);

  const clearAllStates = useCallback(() => {
    stateRef.current.clear();
    setStaleCells(new Set());
    setVersion((v) => v + 1);
  }, []);

  const markCellsStale = useCallback((cellIds: Set<string>) => {
    setStaleCells((prev) => {
      const next = new Set(prev);
      for (const id of cellIds) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearStaleCells = useCallback(() => {
    setStaleCells(new Set());
  }, []);

  return {
    getCellState,
    setCellState,
    clearAllStates,
    staleCells,
    markCellsStale,
    clearStaleCells,
    version,
  };
}
