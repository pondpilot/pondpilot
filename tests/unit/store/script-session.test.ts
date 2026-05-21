import { describe, it, expect, beforeEach } from '@jest/globals';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { SQLScriptId } from '@models/sql-script';
import { useAppStore, markTransient } from '@store/app-store';

describe('script session state management', () => {
  beforeEach(() => {
    useAppStore.setState({ sqlScriptSessions: new Map() });
  });

  it('seeds transient sessions with the default catalog and schema', () => {
    const scriptId = 'script-1' as SQLScriptId;

    markTransient(scriptId);

    expect(useAppStore.getState().sqlScriptSessions.get(scriptId)).toEqual({
      scriptId,
      currentCatalog: PERSISTENT_DB_NAME,
      currentSchema: 'main',
      searchPath: null,
      isTransient: true,
    });
  });
});
