/// <reference lib="webworker" />

import * as Comlink from 'comlink';
import { openDB } from 'idb';
import { FILE_HANDLE_DB_NAME, FILE_HANDLE_STORE_NAME } from '@consts/idb';
import { Dataset, CodeEditor } from '@models/common';
import { createName, getSessionDirectory, getSupportedMimeType } from '../../utils/helpers';
import { AddDataSourceBase, DeleteDataSourceProps, SessionFiles } from './models';

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

const methods = {
  onAddDataSource,
  onDeleteDataSource,
  getFileSystemSources,
};

export type SessionWorker = typeof methods;
Comlink.expose(methods);
