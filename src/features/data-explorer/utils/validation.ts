import { TreeNodeData } from '@components/explorer-tree';
import { AnyFlatFileDataSource, LocalDB, RemoteDB } from '@models/data-source';
import { LocalEntry } from '@models/file-system';

import { DataExplorerNodeTypeMap } from '../model';

/**
 * Validate database rename
 */
export function validateDbRename(
  node: TreeNodeData<DataExplorerNodeTypeMap>,
  newName: string,
  dbList: (LocalDB | RemoteDB)[],
): string | null {
  newName = newName.trim();

  if (newName.length === 0) {
    return 'Name cannot be empty';
  }

  if (
    dbList.some((db) => db.id !== node.value && db.dbName.toLowerCase() === newName.toLowerCase())
  ) {
    return 'Name must be unique';
  }

  return null;
}

/**
 * Validate file rename
 */
export function validateFileRename(
  node: TreeNodeData<DataExplorerNodeTypeMap>,
  newName: string,
  fileSources: Iterable<AnyFlatFileDataSource>,
): string | null {
  newName = newName.trim();

  if (newName.length === 0) {
    return 'Name cannot be empty';
  }

  for (const f of fileSources) {
    if (f.id !== node.value && f.viewName.toLowerCase() === newName.toLowerCase()) {
      return 'Name must be unique';
    }
  }

  return null;
}

/**
 * Validate XLSX file rename
 */
export function validateXlsxFileRename(
  newName: string,
  fileEntries: Iterable<LocalEntry>,
  thisEntry: LocalEntry,
): string | null {
  newName = newName.trim();

  if (newName.length === 0) {
    return 'Name cannot be empty';
  }

  for (const f of fileEntries) {
    if (f.id !== thisEntry.id && f.uniqueAlias.toLowerCase() === newName.toLowerCase()) {
      return 'Name must be unique';
    }
  }

  return null;
}
