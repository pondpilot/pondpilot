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
 * Manages execution state for all cells in a notebook.
 *
 * Uses a Map<cellId, CellExecutionState> internally, and exposes
 * a version counter so consumers can subscribe to changes without
 * needing the full map in their dependency arrays.
 */
export function useNotebookExecutionState() {
  const stateRef = useRef(new Map<string, CellExecutionState>());
  const [version, setVersion] = useState(0);

  const getCellState = useCallback(
    (cellId: string): CellExecutionState => {
      return stateRef.current.get(cellId) ?? IDLE_STATE;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version forces callback identity update on state changes
    [version],
  );

  const setCellState = useCallback((cellId: string, state: CellExecutionState) => {
    stateRef.current.set(cellId, state);
    setVersion((v) => v + 1);
  }, []);

  const clearAllStates = useCallback(() => {
    stateRef.current.clear();
    setVersion((v) => v + 1);
  }, []);

  return {
    getCellState,
    setCellState,
    clearAllStates,
    version,
  };
}
