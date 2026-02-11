import { Notebook, NotebookId } from '@models/notebook';
import { NotebookTab } from '@models/tab';
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
    activeCellId: notebook.cells.length > 0 ? notebook.cells[0].id : null,
    dataViewStateCache: null,
  };

  const newTabs = new Map(state.tabs).set(tabId, tab);
  const newTabOrder = [...state.tabOrder, tabId];
  const newActiveTabId = setActive ? tabId : state.activeTabId;

  useAppStore.setState(
    {
      activeTabId: newActiveTabId,
      tabs: newTabs,
      tabOrder: newTabOrder,
    },
    undefined,
    'AppStore/createTabFromNotebook',
  );

  const iDb = state._iDbConn;
  if (iDb) {
    persistCreateTab(iDb, tab, newTabOrder, newActiveTabId);
  }

  return tab;
};
