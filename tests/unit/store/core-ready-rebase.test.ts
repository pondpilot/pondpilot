import { describe, expect, it } from '@jest/globals';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { AnyTab, TabId } from '@models/tab';
import { CoreAppDataSnapshot, rebaseCoreReadyChanges } from '@store/restore';

const script = (id: string, content: string): SQLScript => ({
  id: id as SQLScriptId,
  name: id,
  content,
});

const scriptTab = (id: string, scriptId: string): AnyTab => ({
  id: id as TabId,
  type: 'script',
  sqlScriptId: scriptId as SQLScriptId,
  dataViewPaneHeight: 0,
  editorPaneHeight: 0,
  lastExecutedQuery: null,
  dataViewStateCache: null,
});

const snapshot = (overrides: Partial<CoreAppDataSnapshot> = {}): CoreAppDataSnapshot => ({
  iDbConn: {} as CoreAppDataSnapshot['iDbConn'],
  sqlScripts: new Map(),
  tabs: new Map(),
  tabOrder: [],
  activeTabId: null,
  previewTabId: null,
  scriptAccessTimes: new Map(),
  ...overrides,
});

describe('core-ready restore rebase', () => {
  it('preserves scripts created, edited, and deleted while the full restore runs', () => {
    const unchanged = script('unchanged', 'select 1');
    const edited = script('edited', 'select 2');
    const deleted = script('deleted', 'select 3');
    const baseline = snapshot({
      sqlScripts: new Map([
        [unchanged.id, unchanged],
        [edited.id, edited],
        [deleted.id, deleted],
      ]),
    });
    const restoredUnchanged = script('unchanged', 'migrated by restore');
    const currentEdit = script('edited', 'select 42');
    const created = script('created', 'select 99');

    const result = rebaseCoreReadyChanges({
      restoredSqlScripts: new Map([
        [restoredUnchanged.id, restoredUnchanged],
        [edited.id, edited],
        [deleted.id, deleted],
      ]),
      restoredTabs: new Map(),
      restoredTabOrder: [],
      restoredActiveTabId: null,
      restoredPreviewTabId: null,
      restoredScriptAccessTimes: new Map(),
      baseline,
      current: {
        ...baseline,
        sqlScripts: new Map([
          [unchanged.id, unchanged],
          [currentEdit.id, currentEdit],
          [created.id, created],
        ]),
      },
    });

    expect(result.sqlScripts.get(unchanged.id)).toBe(restoredUnchanged);
    expect(result.sqlScripts.get(edited.id)).toBe(currentEdit);
    expect(result.sqlScripts.get(created.id)).toBe(created);
    expect(result.sqlScripts.has(deleted.id)).toBe(false);
  });

  it('keeps restored tabs and appends tabs opened during core-ready', () => {
    const restoredTab = scriptTab('restored-tab', 'restored-script');
    const gapTab = scriptTab('gap-tab', 'gap-script');
    const baseline = snapshot();

    const result = rebaseCoreReadyChanges({
      restoredSqlScripts: new Map(),
      restoredTabs: new Map([[restoredTab.id, restoredTab]]),
      restoredTabOrder: [restoredTab.id],
      restoredActiveTabId: restoredTab.id,
      restoredPreviewTabId: null,
      restoredScriptAccessTimes: new Map(),
      baseline,
      current: {
        ...baseline,
        tabs: new Map([[gapTab.id, gapTab]]),
        tabOrder: [gapTab.id],
        activeTabId: gapTab.id,
        previewTabId: gapTab.id,
      },
    });

    expect(Array.from(result.tabs.keys())).toEqual([restoredTab.id, gapTab.id]);
    expect(result.tabOrder).toEqual([restoredTab.id, gapTab.id]);
    expect(result.activeTabId).toBe(gapTab.id);
    expect(result.previewTabId).toBe(gapTab.id);
  });

  it('preserves tab deletion and reordering after a blocked-tab restart', () => {
    const first = scriptTab('first', 'first-script');
    const second = scriptTab('second', 'second-script');
    const baseline = snapshot({
      tabs: new Map([
        [first.id, first],
        [second.id, second],
      ]),
      tabOrder: [first.id, second.id],
      activeTabId: first.id,
    });

    const result = rebaseCoreReadyChanges({
      restoredSqlScripts: new Map(),
      restoredTabs: new Map(baseline.tabs),
      restoredTabOrder: baseline.tabOrder,
      restoredActiveTabId: baseline.activeTabId,
      restoredPreviewTabId: null,
      restoredScriptAccessTimes: new Map(),
      baseline,
      current: {
        ...baseline,
        tabs: new Map([[second.id, second]]),
        tabOrder: [second.id],
        activeTabId: second.id,
      },
    });

    expect(Array.from(result.tabs.keys())).toEqual([second.id]);
    expect(result.tabOrder).toEqual([second.id]);
    expect(result.activeTabId).toBe(second.id);
  });
});
