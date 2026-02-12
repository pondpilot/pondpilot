import { AsyncDuckDBPooledConnection } from '@features/duckdb-context/duckdb-pooled-connection';
import { useDataAdapter } from '@features/tab-view/hooks/use-data-adapter';
import { DataAdapterApi } from '@models/data-adapter';
import { ScriptTab, TabId } from '@models/tab';
import { useMemo, useRef } from 'react';

import { CellExecutionState } from './use-notebook-execution-state';

/**
 * Per-cell data adapter that wraps the existing useDataAdapter hook.
 *
 * Creates a lightweight "virtual tab" that mimics a ScriptTab so the
 * standard data adapter infrastructure can operate independently per cell.
 * Each cell gets its own pagination, sorting, and schema state.
 *
 * When `getConnection` is provided, notebook-scoped queries are resolved
 * with the shared connection context so temp views (__cell_N) remain visible.
 */
export function useCellDataAdapter(
  cellId: string,
  cellState: CellExecutionState,
  getConnection?: () => Promise<AsyncDuckDBPooledConnection>,
): DataAdapterApi | null {
  // Track source version to force the data adapter to refetch on every execution,
  // even when the SQL text is identical. We increment when a cell transitions from
  // 'running' to 'success', which happens exactly once per completed execution.
  const sourceVersionRef = useRef(0);
  const prevStatusRef = useRef<CellExecutionState['status']>('idle');
  if (cellState.status === 'success' && prevStatusRef.current === 'running') {
    sourceVersionRef.current += 1;
  }
  prevStatusRef.current = cellState.status;

  // Build a virtual ScriptTab-like object for this cell's data adapter.
  // The data adapter only reads `type`, `lastExecutedQuery`, and `id` from the tab.
  const virtualTab = useMemo(() => {
    return {
      type: 'script' as const,
      id: `notebook-cell-${cellId}` as TabId,
      sqlScriptId: '' as any,
      lastExecutedQuery: cellState.lastQuery,
      dataViewPaneHeight: 300,
      editorPaneHeight: 200,
    } satisfies Omit<ScriptTab, 'dataViewStateCache'>;
  }, [cellId, cellState.lastQuery]);

  const dataAdapter = useDataAdapter({
    tab: virtualTab,
    sourceVersion: sourceVersionRef.current,
    getSharedConnection: getConnection,
  });

  return cellState.lastQuery ? dataAdapter : null;
}
