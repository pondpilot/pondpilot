import { beforeEach, describe, expect, it } from '@jest/globals';
import { SQLScriptId } from '@models/sql-script';
import { AnyTab, TabId } from '@models/tab';
import { closeTabs, replacePreviewTab, useAppStore } from '@store/app-store';

const tab = (id: string): AnyTab => ({
  id: id as TabId,
  type: 'script',
  sqlScriptId: `script-${id}` as SQLScriptId,
  dataViewPaneHeight: 0,
  editorPaneHeight: 0,
  lastExecutedQuery: null,
  dataViewStateCache: null,
});

describe('tab store actions', () => {
  beforeEach(() => {
    useAppStore.setState({
      tabs: new Map(),
      tabOrder: [],
      activeTabId: null,
      previewTabId: null,
      tabExecutionErrors: new Map(),
    });
  });

  it('closes tabs and cascades active, preview, order, and execution-error state', () => {
    const first = tab('first');
    const closing = tab('closing');
    const last = tab('last');
    const originalTabs = new Map([
      [first.id, first],
      [closing.id, closing],
      [last.id, last],
    ]);
    const closingError = { errorMessage: 'closing failed', timestamp: 1 };
    const lastError = { errorMessage: 'last failed', timestamp: 2 };

    useAppStore.setState({
      tabs: originalTabs,
      tabOrder: [first.id, closing.id, last.id],
      activeTabId: closing.id,
      previewTabId: closing.id,
      tabExecutionErrors: new Map([
        [closing.id, closingError],
        [last.id, lastError],
      ]),
    });

    const result = closeTabs([closing.id]);
    const state = useAppStore.getState();

    expect(result).toEqual({
      activeTabId: first.id,
      previewTabId: null,
      tabOrder: [first.id, last.id],
    });
    expect(state.tabs).not.toBe(originalTabs);
    expect(Array.from(state.tabs.keys())).toEqual([first.id, last.id]);
    expect(state.tabOrder).toEqual([first.id, last.id]);
    expect(state.activeTabId).toBe(first.id);
    expect(state.previewTabId).toBeNull();
    expect(state.tabExecutionErrors).toEqual(new Map([[last.id, lastError]]));
    expect(originalTabs.has(closing.id)).toBe(true);
  });

  it('replaces a preview tab and preserves unrelated tab execution errors', () => {
    const first = tab('first');
    const preview = tab('preview');
    const replacement = tab('replacement');
    const previewError = { errorMessage: 'preview failed', timestamp: 1 };

    useAppStore.setState({
      tabs: new Map([
        [first.id, first],
        [preview.id, preview],
        [replacement.id, replacement],
      ]),
      tabOrder: [first.id, preview.id, replacement.id],
      activeTabId: preview.id,
      previewTabId: preview.id,
      tabExecutionErrors: new Map([[preview.id, previewError]]),
    });

    const result = replacePreviewTab(preview.id, replacement.id);
    const state = useAppStore.getState();

    expect(result).toEqual({
      activeTabId: first.id,
      previewTabId: replacement.id,
      tabOrder: [first.id, replacement.id],
    });
    expect(Array.from(state.tabs.keys())).toEqual([first.id, replacement.id]);
    expect(state.activeTabId).toBe(first.id);
    expect(state.previewTabId).toBe(replacement.id);
    expect(state.tabExecutionErrors.get(preview.id)).toBe(previewError);
  });
});
