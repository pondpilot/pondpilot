import { AddDataSourceProps, Dataset } from '@models/common';
import { createName, findUniqueName, getSupportedMimeType } from '@utils/helpers';
import { openDB } from 'idb';
import { v4 as uuidv4 } from 'uuid';

const APP_DB_NAME = 'app-database';
const DB_VERSION = 1;
const TAB_PREFIX = 'tab_';
const FILE_HANDLE_PREFIX = 'file_';
const QUERY_PREFIX = 'query_';

const dbPromise = openDB(APP_DB_NAME, DB_VERSION, {
  upgrade(db) {
    db.createObjectStore('tabs-store');
    db.createObjectStore('file-handles-store');
    db.createObjectStore('queries-store');
  },
});

export type TabType = 'query' | 'file';
export type LoadingState = 'fetching' | 'error' | 'success' | 'pending';
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
  value: string;
  codeSelection: {
    start: number;
    end: number;
  };
  undoHistory: string[];
}

/**
 * Query state for the query tab.
 *
 * @property {LoadingState} state - The current state of the query.
 * @property {string} originalQuery - The original query statement for pagination.
 */
export interface QueryState {
  state: LoadingState;
  originalQuery: string;
}

export interface TabLayout {
  tableColumnWidth: Record<string, number>;
  editorPaneHeight: number;
  dataViewPaneHeight: number;
}

export interface DataViewState {
  data: Uint8Array<ArrayBufferLike> | undefined;
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
  state: LoadingState;
  query: QueryState;
  active: boolean;
  pagination: TabPagination;
  sort: TabSort;
  editor: EditorState;
  layout: TabLayout;
  dataView: DataViewState;
  order: number;
  sourceId: string;
  stable: boolean;
}

export interface Tab extends TabBase {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export type CreateTab = TabBase;
export type UpdateTab = Partial<Tab>;

export interface TabMetaInfo
  extends Omit<Tab, 'editor' | 'layout' | 'dataView' | 'pagination' | 'sort'> {}

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

    await (await dbPromise).put('tabs-store', newTab, id);
    return newTab;
  },

  async getTab(id: string): Promise<Tab | undefined> {
    return (await dbPromise).get('tabs-store', id);
  },

  async getTabs(ids: string[]): Promise<(Tab | undefined)[]> {
    const db = await dbPromise;
    return Promise.all(ids.map((id) => db.get('tabs-store', id)));
  },

  async getAllTabs(): Promise<Tab[]> {
    return (await dbPromise).getAll('tabs-store');
  },

  async updateTab(id: string, updateFn: (tab: Tab) => Tab): Promise<void> {
    const db = await dbPromise;
    const tx = db.transaction('tabs-store', 'readwrite');

    const tab = await tx.store.get(id);

    if (!tab) return;

    const updatedTab = updateFn({
      ...tab,
      updatedAt: Date.now(),
    });

    await tx.store.put(updatedTab, id);
    await tx.done;
  },

  async deleteTab(id: string): Promise<void> {
    await (await dbPromise).delete('tabs-store', id);
  },

  async deleteTabs(ids: string[]): Promise<void> {
    const db = await dbPromise;
    const tx = db.transaction('tabs-store', 'readwrite');

    for (const id of ids) {
      await tx.store.delete(id);
    }

    await tx.done;
  },
};

export const fileHandleStoreApi = {
  addDataSources: async (data: AddDataSourceProps): Promise<void> => {
    const db = await dbPromise;
    const tx = db.transaction('file-handles-store', 'readwrite');

    for await (const { entry, filename: filenameRaw, type } of data) {
      const meta = getSupportedMimeType(filenameRaw);
      if (!entry || !meta || meta.ext === 'sql') {
        continue;
      }

      if (type === 'FILE_HANDLE') {
        const id = `${FILE_HANDLE_PREFIX}${uuidv4()}`;
        await tx.store.put(entry, id);
      }
    }

    await tx.done;
  },

  getDataSources: async (): Promise<Dataset[]> => {
    const db = await dbPromise;
    const allKeys = await db.getAllKeys('file-handles-store');
    const sources: Dataset[] = [];

    for (const key of allKeys) {
      const handle = await db.get('file-handles-store', key);
      const meta = getSupportedMimeType(handle.name);

      if (!meta) {
        continue;
      }

      const { mimeType, kind, ext } = meta;
      if (kind === 'DATASET') {
        const entry: Dataset = {
          id: key as string,
          kind,
          ext,
          mimeType,
          handle,
          path: handle.name,
          name: createName(handle.name),
        };
        sources.push(entry);
      }
    }

    return sources;
  },

  onDeleteDataSource: async (ids: string[]): Promise<void> => {
    const db = await dbPromise;
    const tx = db.transaction('file-handles-store', 'readwrite');

    for (const id of ids) {
      await tx.store.delete(id);
    }

    await tx.done;
  },
};

interface QueryFile {
  id: string;
  name: string;
  content: string;
  mimeType: string;
  ext: string;
}

export const queryStoreApi = {
  createQueryFile: async (name: string, content?: string): Promise<QueryFile> => {
    const db = await dbPromise;
    const allKeys = await db
      .getAll('queries-store')
      .then((queries) => queries.map((query) => query.name));

    const checkIfExists = async (value: string) => allKeys.some((key) => key === value);

    const fileName = await findUniqueName(`${name}.sql`, checkIfExists);

    const entry = {
      id: `${QUERY_PREFIX}${uuidv4()}`,
      name: fileName,
      content: content || '',
      mimeType: 'text/sql',
      ext: 'sql',
    };

    await db.put('queries-store', entry, entry.id);
    return entry;
  },

  getQueryFiles: async (): Promise<QueryFile[]> => (await dbPromise).getAll('queries-store'),

  deleteQueryFiles: async (ids: string[]): Promise<void> => {
    const db = await dbPromise;
    const tx = db.transaction('queries-store', 'readwrite');

    for (const id of ids) {
      await tx.store.delete(id);
    }

    await tx.done;
  },

  renameQueryFile: async (id: string, name: string): Promise<void> => {
    const db = await dbPromise;
    const query = await db.get('queries-store', id);

    if (!query) return;

    query.name = name;
    await db.put('queries-store', query, id);
  },

  changeQueryContent: async (id: string, content: string): Promise<void> => {
    const db = await dbPromise;
    const query = await db.get('queries-store', id);

    if (!query) return;

    query.content = content;
    await db.put('queries-store', query, id);
  },
};
