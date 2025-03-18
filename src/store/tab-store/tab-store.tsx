import { get, set, update, del, delMany, getMany, entries, createStore } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';

export interface Tab {
  id: string;
  createdAt: number;
  updatedAt: number;
  name: string;
  order: number;
  type: 'query' | 'file';
  state: 'fetching' | 'error' | 'success' | 'pending';
  active: boolean;
  pagination: {
    page: number;
    limit: number;
  };
  sort: {
    column: string;
    order: 'asc' | 'desc';
  };
  editor: {
    fullQuery: string;
    lastQuery: string;
    codeSelection: {
      start: number;
      end: number;
    };
    undoHistory: string[];
  };
  layout: {
    tableColumnWidth: number[];
    editorPaneHeight: number;
    dataViewPaneHeight: number;
  };
  dataView: {
    data: Uint8Array | null;
    rowCount: number;
    columnCount: number;
    selection: {
      cell?: string;
      rows: Record<string, boolean>;
      columns: Record<string, boolean>;
    };
  };
}

export interface TabMetaInfo {
  id: string;
  name: string;
  order: number;
  type: 'query' | 'file';
  active: boolean;
  state: 'fetching' | 'error' | 'success' | 'pending';
}

const tabsStore = createStore('tabs-db', 'tabs-store');

const TAB_PREFIX = 'tab_';

export const tabStoreApi = {
  async createTab(tab: Omit<Tab, 'id' | 'createdAt' | 'updatedAt'>): Promise<Tab> {
    const id = `${TAB_PREFIX}${uuidv4()}`;
    const now = Date.now();

    const newTab: Tab = {
      id,
      createdAt: now,
      updatedAt: now,
      ...tab,
    };

    await set(id, newTab, tabsStore);
    return newTab;
  },

  async getTab(id: string): Promise<Tab | undefined> {
    return get(id, tabsStore);
  },

  async getTabs(ids: string[]): Promise<(Tab | undefined)[]> {
    return getMany(ids, tabsStore);
  },

  async getAllTabs(): Promise<Tab[]> {
    const allEntries = await entries(tabsStore);
    return allEntries
      .filter(([key]) => typeof key === 'string' && key.startsWith(TAB_PREFIX))
      .map(([_, value]) => value as Tab);
  },

  async updateTab(id: string, updateFn: (tab: Tab) => Tab): Promise<void> {
    return update(
      id,
      (tab) => {
        if (!tab) return undefined;

        const updatedTab = updateFn({
          ...tab,
          updatedAt: Date.now(),
        });

        return updatedTab;
      },
      tabsStore,
    );
  },

  async deleteTab(id: string): Promise<void> {
    await del(id, tabsStore);
  },

  async deleteTabs(ids: string[]): Promise<void> {
    await delMany(ids, tabsStore);
  },
};
