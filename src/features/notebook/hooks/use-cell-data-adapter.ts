import { AsyncDuckDBPooledConnection } from '@features/duckdb-context/duckdb-pooled-connection';
import { useDataAdapter } from '@features/tab-view/hooks/use-data-adapter';
import { DataAdapterApi } from '@models/data-adapter';
import { ScriptTab, TabId } from '@models/tab';
import { NOTEBOOK_CELL_REF_PREFIX } from '@utils/notebook';
import { useMemo, useRef } from 'react';

import { CellExecutionState } from './use-notebook-execution-state';

const NOTEBOOK_CELL_REF_PREFIX_LOWER = NOTEBOOK_CELL_REF_PREFIX.toLowerCase();

/**
 * Per-cell data adapter that wraps the existing useDataAdapter hook.
 *
 * Creates a lightweight "virtual tab" that mimics a ScriptTab so the
 * standard data adapter infrastructure can operate independently per cell.
 * Each cell gets its own pagination, sorting, and schema state.
 *
 * When `getConnection` is provided, notebook-scoped queries are resolved
 * with the shared connection context so per-cell temp views remain visible.
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

  // Persisted notebook executions may contain temp-view queries that cannot be
  // re-run after app reload (the connection-scoped views no longer exist).
  // Suppress those queries until the user re-executes the cell.
  const safeLastQuery = useMemo(() => {
    const query = cellState.lastQuery?.trim();
    if (!query) return null;

    if (query.toLowerCase().includes(NOTEBOOK_CELL_REF_PREFIX_LOWER)) {
      return null;
    }

    return query;
  }, [cellState.lastQuery]);

  // Build a virtual ScriptTab-like object for this cell's data adapter.
  // The data adapter only reads `type`, `lastExecutedQuery`, and `id` from the tab.
  const virtualTab = useMemo(() => {
    return {
      type: 'script' as const,
      id: `notebook-cell-${cellId}` as TabId,
      sqlScriptId: '' as any,
      lastExecutedQuery: safeLastQuery,
      dataViewPaneHeight: 300,
      editorPaneHeight: 200,
    } satisfies Omit<ScriptTab, 'dataViewStateCache'>;
  }, [cellId, safeLastQuery]);

  const dataAdapter = useDataAdapter({
    tab: virtualTab,
    sourceVersion: sourceVersionRef.current,
    getSharedConnection: getConnection,
  });

  return safeLastQuery ? dataAdapter : null;
}
