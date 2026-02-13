import { CellId, Notebook, NotebookId } from '@models/notebook';
import { TAB_TABLE_NAME } from '@models/persisted-store';
import { NotebookTab, TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { ensureNotebook } from '@utils/notebook';
import { makeTabId } from '@utils/tab';

import { persistCreateTab } from './persist';
import { findTabFromNotebookImpl } from './pure';
import { setActiveTabId } from './tab-controller';

/**
 * Finds a tab displaying an existing notebook or undefined.
 *
 * @param notebookOrId - The ID or a Notebook object to find the tab for.
 * @returns A NotebookTab object if found.
 * @throws An error if the Notebook with the given ID does not exist.
 */
export const findTabFromNotebook = (
  notebookOrId: Notebook | NotebookId,
): NotebookTab | undefined => {
  const state = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, state.notebooks);
  return findTabFromNotebookImpl(state.tabs, notebook.id);
};

/**
 * Gets existing or creates a new tab from an existing notebook.
 * If the notebook is already associated with a tab, it returns that tab without creating a new one.
 *
 * @param notebookOrId - The ID or a Notebook object to create a tab from.
 * @param setActive - Whether to set the new tab as active.
 * @returns A NotebookTab object.
 * @throws An error if the Notebook with the given ID does not exist.
 */
export const getOrCreateTabFromNotebook = (
  notebookOrId: Notebook | NotebookId,
  setActive: boolean = false,
): NotebookTab => {
  const state = useAppStore.getState();
  const notebook = ensureNotebook(notebookOrId, state.notebooks);

  const existingTab = findTabFromNotebookImpl(state.tabs, notebook.id);

  if (existingTab) {
    if (setActive) {
      setActiveTabId(existingTab.id);
    }
    return existingTab;
  }

  const tabId = makeTabId();
  const tab: NotebookTab = {
    type: 'notebook',
    id: tabId,
    notebookId: notebook.id,
    activeCellId:
      notebook.cells.length > 0
        ? [...notebook.cells].sort((a, b) => a.order - b.order)[0].id
        : null,
    dataViewStateCache: null,
  };

  const newTabs = new Map(state.tabs).set(tabId, tab);
  const newTabOrder = [...state.tabOrder, tabId];

  useAppStore.setState(
    {
      tabs: newTabs,
      tabOrder: newTabOrder,
    },
    undefined,
    'AppStore/createTabFromNotebook',
  );

  const iDb = state._iDbConn;
  if (iDb) {
    const newActiveTabId = setActive ? tabId : state.activeTabId;
    persistCreateTab(iDb, tab, newTabOrder, newActiveTabId);
  }

  // Set as active after creating the tab so notebook last-used tracking is updated.
  if (setActive) {
    setActiveTabId(tabId);
  }

  return tab;
};

/**
 * Updates the active cell ID on a notebook tab.
 */
export const setNotebookActiveCellId = (tabId: TabId, activeCellId: CellId | null): void => {
  const state = useAppStore.getState();
  const tab = state.tabs.get(tabId);

  if (!tab || tab.type !== 'notebook') {
    return;
  }

  if (tab.activeCellId === activeCellId) {
    return;
  }

  const updatedTab: NotebookTab = {
    ...tab,
    activeCellId,
  };

  const newTabs = new Map(state.tabs).set(tabId, updatedTab);

  useAppStore.setState({ tabs: newTabs }, undefined, 'AppStore/setNotebookActiveCellId');

  const iDb = state._iDbConn;
  if (iDb) {
    iDb.put(TAB_TABLE_NAME, updatedTab, tabId);
  }
};
