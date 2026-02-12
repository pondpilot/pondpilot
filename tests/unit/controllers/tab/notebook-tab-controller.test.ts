/* eslint-disable import/order, import/first */
// Module-under-test imports must come after jest.mock calls for proper mock hoisting.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CellId, Notebook, NotebookId } from '@models/notebook';
import { NotebookTab, TabId } from '@models/tab';

let mockState: any;
let mockSetState: jest.Mock;

jest.mock('@store/app-store', () => ({
  useAppStore: {
    getState: () => mockState,
    setState: (...args: any[]) => mockSetState(...args),
  },
}));

jest.mock('@utils/notebook', () => ({
  ensureNotebook: jest.fn(
    (notebookOrId: Notebook | NotebookId, notebooks: Map<NotebookId, Notebook>) => {
      if (typeof notebookOrId === 'string') {
        return notebooks.get(notebookOrId);
      }
      return notebookOrId;
    },
  ),
}));

jest.mock('@utils/tab', () => ({
  makeTabId: jest.fn(() => 'new-notebook-tab' as TabId),
}));

jest.mock('@controllers/tab/persist', () => ({
  persistCreateTab: jest.fn(),
}));

jest.mock('@controllers/tab/pure', () => ({
  findTabFromNotebookImpl: jest.fn(),
}));

jest.mock('@controllers/tab/tab-controller', () => ({
  setActiveTabId: jest.fn(),
}));

import { getOrCreateTabFromNotebook } from '@controllers/tab/notebook-tab-controller';
import { persistCreateTab } from '@controllers/tab/persist';
import { findTabFromNotebookImpl } from '@controllers/tab/pure';
import { setActiveTabId } from '@controllers/tab/tab-controller';

describe('notebook-tab-controller', () => {
  const notebookId = 'notebook-1' as NotebookId;
  const cellId = 'cell-1' as CellId;

  const notebook: Notebook = {
    id: notebookId,
    name: 'Notebook',
    cells: [{ id: cellId, type: 'sql', content: 'SELECT 1', order: 0 }],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    mockSetState = jest.fn();
    mockState = {
      notebooks: new Map([[notebookId, notebook]]),
      tabs: new Map(),
      tabOrder: [],
      activeTabId: 'existing-tab' as TabId,
      _iDbConn: { mock: true },
    };

    (findTabFromNotebookImpl as jest.Mock).mockReset();
    (persistCreateTab as jest.Mock).mockReset();
    (setActiveTabId as jest.Mock).mockReset();
  });

  it('activates a newly-created notebook tab through setActiveTabId to update LRU tracking', () => {
    (findTabFromNotebookImpl as jest.Mock).mockReturnValue(undefined);

    const tab = getOrCreateTabFromNotebook(notebookId, true);

    expect(tab.id).toBe('new-notebook-tab');
    expect(mockSetState).toHaveBeenCalledTimes(1);

    const stateUpdate = mockSetState.mock.calls[0][0] as Record<string, unknown>;
    expect(stateUpdate).toEqual({
      tabs: expect.any(Map),
      tabOrder: ['new-notebook-tab'],
    });
    expect(stateUpdate).not.toHaveProperty('activeTabId');

    expect(persistCreateTab).toHaveBeenCalledWith(
      mockState._iDbConn,
      expect.objectContaining({ id: 'new-notebook-tab' }),
      ['new-notebook-tab'],
      'new-notebook-tab',
    );
    expect(setActiveTabId).toHaveBeenCalledWith('new-notebook-tab');
  });

  it('reuses existing tab and delegates activation without creating a new one', () => {
    const existingTab: NotebookTab = {
      type: 'notebook',
      id: 'existing-notebook-tab' as TabId,
      notebookId,
      activeCellId: cellId,
      dataViewStateCache: null,
    };
    (findTabFromNotebookImpl as jest.Mock).mockReturnValue(existingTab);

    const tab = getOrCreateTabFromNotebook(notebookId, true);

    expect(tab).toBe(existingTab);
    expect(mockSetState).not.toHaveBeenCalled();
    expect(persistCreateTab).not.toHaveBeenCalled();
    expect(setActiveTabId).toHaveBeenCalledWith(existingTab.id);
  });
});
