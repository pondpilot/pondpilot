/* eslint-disable no-console */
/* eslint-disable no-continue */
/// <reference lib="webworker" />

import * as Comlink from 'comlink';
import { openDB } from 'idb';
import JSZip from 'jszip';
import {
  FILE_HANDLE_DB_NAME,
  FILE_HANDLE_STORE_NAME,
  TABS_DB_NAME,
  TABS_STORE_NAME,
} from '@consts/idb';
import {
  Dataset,
  CodeEditor,
  SaveEditorProps,
  SaveEditorResponse,
  CodeSource,
} from '@models/common';
import {
  createName,
  findUniqueName,
  getSessionDirectory,
  getSupportedMimeType,
} from '../../utils/helpers';
import {
  AddDataSourceBase,
  AddTabProps,
  DeleteDataSourceProps,
  RenameDataSourceProps,
  SessionFiles,
  TabModel,
} from './models';

const getSessionFiles = async (
  directoryHandle: FileSystemDirectoryHandle,
  sessionDirId = 'test',
): Promise<SessionFiles> => {
  const sources: Dataset[] = [];
  const editors: CodeEditor[] = [];

  const entries = directoryHandle.entries();

  const db = await openDB(FILE_HANDLE_DB_NAME, 1, {
    upgrade: (d) => d.createObjectStore(FILE_HANDLE_STORE_NAME),
  });
  const handles: FileSystemFileHandle[] = await db.getAll(FILE_HANDLE_STORE_NAME);

  for (const handle of handles) {
    const meta = getSupportedMimeType(handle.name);

    if (!meta) {
      continue;
    }
    const { mimeType, kind, ext } = meta;

    switch (kind) {
      case 'DATASET': {
        const entry: Dataset = {
          path: handle.name,
          kind,
          ext,
          mimeType,
          handle,
          name: createName(handle.name),
        };
        sources.push(entry);
        break;
      }
    }
  }

  for await (const [fileName, handle] of entries) {
    const meta = getSupportedMimeType(fileName);

    if (handle.kind === 'directory' || !meta) {
      continue;
    }

    const { mimeType, kind, ext } = meta;

    switch (kind) {
      case 'CODE': {
        const file = await handle.getFile();
        const content = await file.text();
        const entry: CodeEditor = {
          path: fileName,
          kind,
          ext,
          mimeType,
          handle,
          content,
        };
        editors.push(entry);
        break;
      }
    }
  }

  return {
    sessionDirId,
    directoryHandle,
    sources,
    editors,
  };
};

const getFileSystemSources = async () => {
  try {
    const directoryHandle = await getSessionDirectory();
    const result = await getSessionFiles(directoryHandle);

    return result;
  } catch (e) {
    console.error('Error getting current sources: ', e);
    return null;
  }
};

async function onSaveEditor({ content, path }: SaveEditorProps): Promise<SaveEditorResponse> {
  let draftHandle: FileSystemFileHandle | undefined;

  try {
    const directory = await getSessionDirectory();

    draftHandle = await directory.getFileHandle(path, {
      create: true,
    });

    const syncHandle = await draftHandle.createSyncAccessHandle();

    const textEncoder = new TextEncoder();

    const buffer = textEncoder.encode(content);

    syncHandle.truncate(0); // clear the file
    syncHandle.write(buffer, { at: 0 });
    syncHandle.flush();
    syncHandle.close();

    const payload: SaveEditorResponse = {
      handle: draftHandle,
      content,
      path,
      error: null,
    };

    return payload;
  } catch (error) {
    console.error(`Error saving file: ${path}: `, error);
    const payload: SaveEditorResponse = {
      handle: draftHandle,
      content,
      path,
      error: error instanceof Error ? error : new Error('Unknown error'),
    };

    return payload;
  }
}

/**
 * Register the data source in the session.
 */
const onAddDataSource = async ({ entries }: AddDataSourceBase) => {
  const sources: Dataset[] = [];

  for await (const { entry, filename: filenameRaw, type } of entries) {
    const meta = getSupportedMimeType(filenameRaw);
    if (!entry || !meta) {
      continue;
    }

    const db = await openDB(FILE_HANDLE_DB_NAME, 1);

    switch (type) {
      case 'FILE_HANDLE': {
        if (meta.ext === 'sql') {
          throw new Error('SQL files are not supported as a data source.');
        }

        await db.put(FILE_HANDLE_STORE_NAME, entry, Date.now().toString());

        const source: Dataset = {
          path: filenameRaw,
          kind: meta.kind,
          mimeType: meta.mimeType,
          ext: meta.ext,
          handle: entry,
          name: createName(filenameRaw),
        };

        sources.push(source);

        continue;
      }
      default:
        break;
    }
  }

  return sources;
};

async function onRenameDataSource({ path, newPath }: RenameDataSourceProps) {
  try {
    const directory = await getSessionDirectory();

    const name = `${newPath.split('.')[0]}.sql` || 'query-name.sql';

    const file = await directory.getFileHandle(path, { create: false });

    // @ts-expect-error - TS doesn't have the correct type for move.
    await file.move(directory, name);

    return {
      name,
      path: name,
      error: null,
      handle: file,
    };
  } catch (e) {
    console.error(`Error renaming editor file: ${path} to ${newPath}`, e);
  }
}

async function onDeleteDataSource({ paths, type }: DeleteDataSourceProps) {
  if (type === 'query') {
    const directory = await getSessionDirectory();
    await Promise.all(
      paths.map(async (p) => {
        await directory.removeEntry(p, { recursive: true });
      }),
    );
    return { paths };
  }

  const db = await openDB(FILE_HANDLE_DB_NAME, 1);
  const allKeys = await db.getAllKeys(FILE_HANDLE_STORE_NAME);

  await Promise.all(
    allKeys.map(async (key) => {
      const entry = await db.get(FILE_HANDLE_STORE_NAME, key);
      if (paths.includes(entry.name)) {
        await db.delete(FILE_HANDLE_STORE_NAME, key);
      }
    }),
  );

  return { paths };
}

const createQueryFile = async (name: string, text?: string) => {
  try {
    const directory = await getSessionDirectory();

    const checkIfExists = async (value: string) => {
      const fileHandle = await directory.getFileHandle(value, { create: false }).catch(() => null);
      return !!fileHandle;
    };

    const filename = await findUniqueName(`${name}.sql`, checkIfExists);

    const draftHandle = await directory.getFileHandle(filename, {
      create: true,
    });

    const syncHandle = await draftHandle.createSyncAccessHandle();

    const textEncoder = new TextEncoder();
    syncHandle.write(textEncoder.encode(text || ''));

    syncHandle.flush();
    syncHandle.close();

    const entry: CodeSource = {
      path: filename,
      kind: 'CODE',
      ext: 'sql',
      mimeType: 'text/sql',
      handle: draftHandle,
    };

    return entry;
  } catch (e) {
    console.error('Error adding editor file: ', e);
    return null;
  }
};

const importSQLFiles = async (
  fileHandles: FileSystemFileHandle[],
): Promise<{ name: string; content: string }[]> => {
  try {
    const directory = await getSessionDirectory();
    const importedEntries: { name: string; content: string }[] = [];

    for (const handle of fileHandles) {
      const file = await handle.getFile();
      const name = file.name.replace(/\.sql$/, '');
      const content = await file.text();

      const existingFile = await directory
        .getFileHandle(file.name, { create: false })
        .catch(() => null);
      if (existingFile) {
        console.warn(`File ${file.name} already exists. Skipping.`);
        continue;
      }

      importedEntries.push({
        name,
        content,
      });
    }

    return importedEntries;
  } catch (error) {
    console.error('Error importing SQL files: ', error);
    return [];
  }
};

/**
 * Export all SQL files in the session as a ZIP archive.
 */
const exportFilesAsArchive = async (): Promise<Blob | null> => {
  try {
    const directory = await getSessionDirectory();
    const zip = new JSZip();

    const entries = directory.entries();
    for await (const [fileName, handle] of entries) {
      if (handle.kind === 'file' && fileName.endsWith('.sql')) {
        const file = await handle.getFile();
        const content = await file.text();
        zip.file(fileName, content);
      }
    }

    const archiveBlob = await zip.generateAsync({ type: 'blob' });
    return archiveBlob;
  } catch (error) {
    console.error('Error exporting files as archive: ', error);
    return null;
  }
};

const getTabs = async (): Promise<TabModel[]> => {
  const db = await openDB(TABS_DB_NAME, 1, {
    upgrade: (d) => {
      if (!d.objectStoreNames.contains(TABS_STORE_NAME)) {
        d.createObjectStore(TABS_STORE_NAME, { keyPath: 'id' }); // Указываем keyPath
      }
    },
  });
  const tabs: TabModel[] = await db.getAll(TABS_STORE_NAME);

  return tabs;
};

const addTab = async (tab: AddTabProps): Promise<TabModel> => {
  const db = await openDB(TABS_DB_NAME, 1);
  const id = Date.now().toString();

  const item: TabModel = { id, ...tab };
  await db.put(TABS_STORE_NAME, item);
  db.close();
  return item;
};

const deleteTabs = async (ids: string[]): Promise<string[]> => {
  const db = await openDB(TABS_DB_NAME, 1);
  await Promise.all(ids.map((id) => db.delete(TABS_STORE_NAME, id)));
  return ids;
};

const updateTabState = async (tab: TabModel): Promise<TabModel> => {
  const db = await openDB(TABS_DB_NAME, 1);

  await db.put(TABS_STORE_NAME, tab);

  return tab;
};

const setTabsOrder = async (tabs: TabModel[]): Promise<TabModel[]> => {
  const db = await openDB(TABS_DB_NAME, 1);

  const tx = db.transaction(TABS_STORE_NAME, 'readwrite');

  await tx.store.clear();

  const tabsWithNewIds = tabs.map((tab, index) => ({
    ...tab,
    id: (Date.now() + index).toString(),
  }));

  await Promise.all(tabsWithNewIds.map((tab) => tx.store.put(tab)));
  await tx.done;

  return tabsWithNewIds;
};

const methods = {
  onAddDataSource,
  onDeleteDataSource,
  createQueryFile,
  getFileSystemSources,
  onSaveEditor,
  onRenameDataSource,
  getTabs,
  deleteTabs,
  addTab,
  updateTabState,
  exportFilesAsArchive,
  importSQLFiles,
  setTabsOrder,
};

export type SessionWorker = typeof methods;
Comlink.expose(methods);
