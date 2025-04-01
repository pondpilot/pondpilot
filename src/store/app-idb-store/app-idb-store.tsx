import {
  AddDataSourceProps,
  Dataset,
  LoadingState,
  Pagination,
  TableSort,
  TabType,
} from '@models/common';
import { createName, findUniqueQueryFileName, getSupportedMimeType } from '@utils/helpers';
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

interface AppEditorState {
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
interface QueryState {
  state: LoadingState;
  originalQuery: string;
}

interface TabLayout {
  tableColumnWidth: Record<string, number>;
  editorPaneHeight: number;
  dataViewPaneHeight: number;
}

interface DataViewState {
  data: Uint8Array<ArrayBufferLike> | undefined;
  rowCount: number;
  selection?: {
    cell: string;
    rows: Record<string, boolean>;
    columns: Record<string, boolean>;
  };
}

interface TabBase {
  name: string;
  type: TabType;
  state: LoadingState;
  query: QueryState;
  active: boolean;
  pagination: Pagination;
  sort?: TableSort;
  // editor: AppEditorState;
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

export type CreateTab = Pick<
  TabBase,
  'name' | 'type' | 'sourceId' | 'state' | 'active' | 'stable'
> &
  Partial<
    Omit<
      TabBase,
      | 'name'
      | 'type'
      | 'sourceId'
      | 'state'
      | 'active'
      | 'stable'
      | 'order'
      | 'id'
      | 'createdAt'
      | 'updatedAt'
    >
  >;
export type UpdateTab = Partial<Tab> & { id: string };

export interface TabMetaInfo
  extends Omit<Tab, 'editor' | 'layout' | 'dataView' | 'pagination' | 'sort'> {}

export const tabStoreApi = {
  async createTab(tab: TabBase): Promise<Tab> {
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
  addFileHandles: async (data: AddDataSourceProps): Promise<void> => {
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

  getFileHandles: async (): Promise<Dataset[]> => {
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

  deleteFileHandles: async (ids: string[]): Promise<void> => {
    const db = await dbPromise;
    const tx = db.transaction('file-handles-store', 'readwrite');

    for (const id of ids) {
      await tx.store.delete(id);
    }

    await tx.done;
  },
};

export interface QueryFile {
  id: string;
  name: string;
  content: string;
  mimeType: string;
  ext: string;
}

export const queryStoreApi = {
  async _getQueryFiles(): Promise<QueryFile[]> {
    return (await dbPromise).getAll('queries-store');
  },
  async _getQueryFileNames(): Promise<string[]> {
    const queries = await queryStoreApi._getQueryFiles();
    return queries.map((query) => query.name);
  },
  async _createQueryFileEntry(name: string, content: string = ''): Promise<QueryFile> {
    const allNames = await queryStoreApi._getQueryFileNames();
    const checkIfExists = (value: string) => allNames.includes(value);
    const fileName = await findUniqueQueryFileName(name, checkIfExists);
    return {
      id: `${QUERY_PREFIX}${uuidv4()}`,
      name: fileName,
      content,
      mimeType: 'text/sql',
      ext: 'sql',
    };
  },
  async createQueryFile(name = 'query', content = ''): Promise<QueryFile> {
    const db = await dbPromise;
    const entry = await queryStoreApi._createQueryFileEntry(name, content);
    await db.put('queries-store', entry, entry.id);
    return entry;
  },
  async createMultipleQueryFiles(
    entries: { name: string; content: string }[],
  ): Promise<QueryFile[]> {
    if (!entries.length) return [];
    const allNames = await queryStoreApi._getQueryFileNames();
    const createdEntries: QueryFile[] = [];
    const namesToCheck = [...allNames];
    for (const entry of entries) {
      const checkIfExists = (value: string) => namesToCheck.includes(value);
      const fileName = await findUniqueQueryFileName(entry.name, checkIfExists);
      const newEntry = {
        id: `${QUERY_PREFIX}${uuidv4()}`,
        name: fileName,
        content: entry.content || '',
        mimeType: 'text/sql',
        ext: 'sql',
      };
      createdEntries.push(newEntry);
      namesToCheck.push(fileName);
    }
    const db = await dbPromise;
    const tx = db.transaction('queries-store', 'readwrite');
    await Promise.all([...createdEntries.map((entry) => tx.store.put(entry, entry.id)), tx.done]);
    return createdEntries;
  },
  async getQueryFiles(): Promise<QueryFile[]> {
    return queryStoreApi._getQueryFiles();
  },
  async updateQueryFile(
    id: string,
    updates: Partial<Pick<QueryFile, 'name' | 'content'>>,
  ): Promise<void> {
    const db = await dbPromise;
    const query = await db.get('queries-store', id);
    if (!query) return;
    const updatedQuery = { ...query, ...updates };
    await db.put('queries-store', updatedQuery, id);
  },
  async renameQueryFile(id: string, name: string): Promise<void> {
    return queryStoreApi.updateQueryFile(id, { name });
  },
  async changeQueryContent(id: string, content: string): Promise<void> {
    return queryStoreApi.updateQueryFile(id, { content });
  },
  async deleteQueryFiles(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const db = await dbPromise;
    const tx = db.transaction('queries-store', 'readwrite');
    await Promise.all(ids.map((id) => tx.store.delete(id)));
    await tx.done;
  },
};
