import { useDataAdapter } from '@features/tab-view/hooks/use-data-adapter';
import { DataAdapterApi } from '@models/data-adapter';
import { ScriptTab, TabId } from '@models/tab';
import { useMemo, useState } from 'react';

import { CellExecutionState } from './use-notebook-execution-state';

/**
 * Per-cell data adapter that wraps the existing useDataAdapter hook.
 *
 * Creates a lightweight "virtual tab" that mimics a ScriptTab so the
 * standard data adapter infrastructure can operate independently per cell.
 * Each cell gets its own pagination, sorting, and schema state.
 */
export function useCellDataAdapter(
  cellId: string,
  cellState: CellExecutionState,
): DataAdapterApi | null {
  const [sourceVersion] = useState(0);

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
    sourceVersion,
  });

  return cellState.lastQuery ? dataAdapter : null;
}
