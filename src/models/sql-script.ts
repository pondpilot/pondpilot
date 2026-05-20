import { NewId } from './new-id';

export type SQLScriptId = NewId<'SQLScriptId'>;

export type SQLScript = {
  id: SQLScriptId;
  /**
   * The name of the SQL script without extension.
   *
   * Extentsion is always implied to be `.sql`.
   */
  name: string;
  content: string;
};

export type SQLScriptSession = {
  scriptId: SQLScriptId;
  currentCatalog: string | null;
  currentSchema: string | null;
  /**
   * The full `search_path` captured after a run (raw value from
   * `current_setting('search_path')`). Restored on replay so a multi-entry
   * path survives connection eviction and reload; `null`/absent means the
   * default path for `currentSchema` is used. Optional for backward
   * compatibility with sessions persisted before this field existed.
   */
  searchPath?: string | null;
  isTransient: boolean;
};

export type ScriptExecutionState = 'idle' | 'running' | 'error' | 'success';

export type RunScriptMode = 'all' | 'selection';
