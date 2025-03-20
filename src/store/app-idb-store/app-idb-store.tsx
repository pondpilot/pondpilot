import { AddDataSourceProps, CodeSource, Dataset } from '@models/common';
import { createName, findUniqueName, getSupportedMimeType } from '@utils/helpers';
import { get, set, update, del, delMany, getMany, entries, createStore, values } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';

const APP_DB = 'app-database';

const tabsStore = createStore(APP_DB, 'tabs-store');
const fileHandlesStore = createStore(APP_DB, 'file-handles-store');
const queriesStore = createStore(APP_DB, 'queries-store');

const TAB_PREFIX = 'tab_';
const FILE_HANDLE_PREFIX = 'file_';
const QUERY_PREFIX = 'query_';

export type TabType = 'query' | 'file';
export type TabState = 'fetching' | 'error' | 'success' | 'pending';
export type SortOrder = 'asc' | 'desc';

export interface TabPagination {
  page: number;
  limit: number;
}

export interface TabSort {
  column: string;
  order: SortOrder;
}

export interface EditorState {
  fullQuery: string;
  lastQuery: string;
  codeSelection: {
    start: number;
    end: number;
  };
  undoHistory: string[];
}

export interface TabLayout {
  tableColumnWidth: Record<string, number>;
  editorPaneHeight: number;
  dataViewPaneHeight: number;
}

export interface DataViewState {
  data: Uint8Array | null;
  rowCount: number;
  columnCount: number;
  selection?: {
    cell: string;
    rows: Record<string, boolean>;
    columns: Record<string, boolean>;
  };
}

export interface TabBase {
  name: string;
  type: TabType;
  state: TabState;
  active: boolean;
  pagination: TabPagination;
  sort: TabSort;
  editor: EditorState;
  layout: TabLayout;
  dataView: DataViewState;
  order: number;
}

export interface Tab extends TabBase {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export type CreateTab = TabBase;
export type UpdateTab = Partial<Tab>;

export interface TabMetaInfo {
  id: string;
  name: string;
  order: number;
  type: 'query' | 'file';
  active: boolean;
  state: 'fetching' | 'error' | 'success' | 'pending';
}

export const tabStoreApi = {
  async createTab(tab: CreateTab): Promise<Tab> {
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
    const allEntries = await values(tabsStore);
    return allEntries;
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

export const fileHandleStoreApi = {
  addDataSources: async (data: AddDataSourceProps): Promise<void> => {
    for await (const { entry, filename: filenameRaw, type } of data) {
      const meta = getSupportedMimeType(filenameRaw);

      if (!entry || !meta || meta.ext === 'sql') {
        continue;
      }

      if (type === 'FILE_HANDLE') {
        const id = `${FILE_HANDLE_PREFIX}${uuidv4()}`;
        await set(id, entry, fileHandlesStore);
      }
    }
  },
  getDataSources: async (): Promise<Dataset[]> => {
    const handles = await entries<string, FileSystemFileHandle>(fileHandlesStore);
    const sources: Dataset[] = [];
    for (const [id, handle] of handles) {
      const meta = getSupportedMimeType(handle.name);

      if (!meta) {
        continue;
      }
      const { mimeType, kind, ext } = meta;

      switch (kind) {
        case 'DATASET': {
          const entry: Dataset = {
            id,
            kind,
            ext,
            mimeType,
            handle,
            path: handle.name,
            name: createName(handle.name),
          };
          sources.push(entry);
          break;
        }
      }
    }
    return sources;
  },
  onDeleteDataSource: async (ids: string[]): Promise<void> => {
    await delMany(ids, fileHandlesStore);
  },
};
export const queryStoreApi = {
  createQueryFile: async (name: string, content?: string): Promise<void> => {
    const queries = await entries(queriesStore);
    const checkIfExists = async (value: string) => !!queries.find(([key]) => key === value);

    const fileName = await findUniqueName(`${name}.sql`, checkIfExists);

    const entry = {
      id: `${QUERY_PREFIX}${uuidv4()}`,
      name: fileName,
      content: content || '',
      mimeType: 'text/sql',
      ext: 'sql',
    };

    await set(entry.id, entry, queriesStore);
  },
  getQueryFiles: async (): Promise<CodeSource[]> => {
    const queries = await values<CodeSource>(queriesStore);
    return queries;
  },
  deleteQueryFiles: async (ids: string[]): Promise<void> => {
    await delMany(ids, queriesStore);
  },
  renameQueryFile: async (id: string, name: string): Promise<void> => {
    await update(
      id,
      (query) => {
        if (!query) return undefined;
        return {
          ...query,
          name,
        };
      },
      queriesStore,
    );
  },
  changeQueryContent: async (id: string, content: string): Promise<void> => {
    await update(
      id,
      (query) => {
        if (!query) return undefined;
        return {
          ...query,
          content,
        };
      },
      queriesStore,
    );
  },
};
