import { NotebookCellExecution } from '@models/notebook';

export const NOTEBOOK_QUERY_SESSION_START_MS = Date.now();

export function resolveReusableNotebookLastQuery(
  execution: Pick<NotebookCellExecution, 'lastQuery' | 'lastRunAt'>,
  notebookCellRefPrefixLower: string,
  sessionStartMs: number = NOTEBOOK_QUERY_SESSION_START_MS,
): string | null {
  const query = execution.lastQuery?.trim();
  if (!query) return null;

  if (query.toLowerCase().includes(notebookCellRefPrefixLower)) {
    return null;
  }

  const lastRunAtMs = execution.lastRunAt ? Date.parse(execution.lastRunAt) : Number.NaN;
  const ranInCurrentSession = Number.isFinite(lastRunAtMs) && lastRunAtMs >= sessionStartMs;

  if (!ranInCurrentSession) {
    return null;
  }

  return query;
}
