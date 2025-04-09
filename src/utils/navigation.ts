import { IconType } from '@features/list-view-icon';
import { PersistentDataViewData, PersistentDataViewId } from '@models/data-view';
import { DataSourceLocalFile, LocalEntry, LocalEntryId } from '@models/file-system';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { AnyTab } from '@models/tab';

/**
 * Constructs a tab name based on the tab type and its properties.
 *
 * Doesn't do any consistency checks, assumes all maps are consistent.
 */
export function getTabName(
  tab: AnyTab,
  sqlScripts: Map<SQLScriptId, SQLScript>,
  dataViews: Map<PersistentDataViewId, PersistentDataViewData>,
  localEntries: Map<LocalEntryId, LocalEntry>,
): string {
  return tab.type === 'script'
    ? sqlScripts.get(tab.sqlScriptId)!.name
    : tab.dataSourceType === 'file'
      ? dataViews.get(tab.dataViewId)!.displayName
      : `${(localEntries.get(tab.localEntryId) as DataSourceLocalFile).uniqueAlias}` +
        `.${tab.schemaName}` +
        `.${tab.objectName}`;
}

export function getTabIcon(
  tab: AnyTab,
  dataViews: Map<PersistentDataViewId, PersistentDataViewData>,
  localEntries: Map<LocalEntryId, LocalEntry>,
): IconType {
  if (tab.type === 'script') {
    return 'code-file';
  }

  if (tab.dataSourceType === 'file') {
    return getDataViewIcon(dataViews.get(tab.dataViewId)!, localEntries);
  }

  // AttachedDBDataTab
  return tab.dbType === 'table' ? 'db-table' : 'db-view';
}

export function getlocalEntryIcon(entry: LocalEntry): IconType {
  return entry.kind === 'directory'
    ? 'folder'
    : entry.fileType === 'code-file'
      ? 'code-file'
      : entry.ext === 'duckdb'
        ? 'db'
        : entry.ext === 'parquet'
          ? 'db-table'
          : entry.ext;
}

/**
 * Constructs a data view name based on state.
 *
 * Doesn't do any consistency checks, assumes all maps are consistent.
 */
export function getDataViewName(
  dataView: PersistentDataViewData,
  localEntries: Map<LocalEntryId, LocalEntry>,
): string {
  const localEntry = localEntries.get(dataView.fileSourceId)! as DataSourceLocalFile;

  return localEntry.uniqueAlias === dataView.displayName
    ? dataView.displayName
    : `${dataView.displayName} (${localEntry.uniqueAlias})`;
}

export function getDataViewIcon(
  dataView: PersistentDataViewData,
  localEntries: Map<LocalEntryId, LocalEntry>,
): IconType {
  const entry = localEntries.get(dataView.fileSourceId);

  if (!entry) {
    return 'error';
  }

  return entry.kind === 'directory'
    ? 'folder'
    : entry.fileType === 'code-file'
      ? 'code-file'
      : entry.ext === 'duckdb'
        ? 'db'
        : entry.ext === 'parquet'
          ? 'db-table'
          : entry.ext;
}
