import { memo } from 'react';

import { CellResultView } from './cell-result-view';
import { useCellDataAdapter } from '../hooks/use-cell-data-adapter';
import { CellExecutionState } from '../hooks/use-notebook-execution-state';

interface CellResultContainerProps {
  cellId: string;
  cellState: CellExecutionState;
  active: boolean;
}

/**
 * Container that bridges per-cell execution state with the data adapter.
 *
 * Each SQL cell gets its own CellResultContainer, which creates an
 * independent data adapter instance. This ensures per-cell pagination
 * and sorting isolation.
 */
export const CellResultContainer = memo(
  ({ cellId, cellState, active }: CellResultContainerProps) => {
    const dataAdapter = useCellDataAdapter(cellId, cellState);

    return (
      <CellResultView
        cellState={cellState}
        dataAdapter={dataAdapter}
        active={active}
      />
    );
  },
);

CellResultContainer.displayName = 'CellResultContainer';
