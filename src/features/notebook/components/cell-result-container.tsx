import { AsyncDuckDBPooledConnection } from '@features/duckdb-context/duckdb-pooled-connection';
import { memo } from 'react';

import { CellResultView } from './cell-result-view';
import { useCellDataAdapter } from '../hooks/use-cell-data-adapter';
import { CellExecutionState } from '../hooks/use-notebook-execution-state';

interface CellResultContainerProps {
  cellId: string;
  cellState: CellExecutionState;
  active: boolean;
  getConnection: () => Promise<AsyncDuckDBPooledConnection>;
}

/**
 * Container that bridges per-cell execution state with the data adapter.
 *
 * Each SQL cell gets its own CellResultContainer, which creates an
 * independent data adapter instance. This ensures per-cell pagination
 * and sorting isolation.
 *
 * The shared notebook connection is passed through so the data adapter
 * can see connection-scoped temp views created during cell execution.
 */
export const CellResultContainer = memo(
  ({ cellId, cellState, active, getConnection }: CellResultContainerProps) => {
    const dataAdapter = useCellDataAdapter(cellId, cellState, getConnection);

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
