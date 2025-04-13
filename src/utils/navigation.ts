import { IconType } from '@components/list-view-icon';
import { AnyDataSource, AnyFlatFileDataSource, PersistentDataSourceId } from '@models/data-source';
import { LocalEntry, LocalEntryId } from '@models/file-system';
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
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
  localEntries: Map<LocalEntryId, LocalEntry>,
): string {
  // ScriptTab
  if (tab.type === 'script') {
    return sqlScripts.get(tab.sqlScriptId)?.name || 'Unknown script';
  }

  const dataSource = dataSources.get(tab.dataSourceId);

  if (!dataSource) {
    return 'Unknown data source';
  }

  // Attached DB objects
  if (tab.dataSourceType === 'db') {
    if (dataSource.type !== 'attached-db') {
      return 'Unknown data source';
    }

    return `${dataSource.dbName}.${tab.schemaName}.${tab.objectName}`;
  }

  // Flat files
  if (dataSource.type === 'attached-db') {
    return 'Unknown data source';
  }

  return getFlatFileDataSourceName(dataSource, localEntries);
}

export function getTabIcon(
  tab: AnyTab,
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
): IconType {
  if (tab.type === 'script') {
    return 'code-file';
  }

  if (tab.dataSourceType === 'file') {
    const dataSource = dataSources.get(tab.dataSourceId);

    if (!dataSource || dataSource.type === 'attached-db') {
      return 'error';
    }
    return getDataSourceIcon(dataSource);
  }

  // AttachedDBDataTab
  return tab.dbType === 'table' ? 'db-table' : 'db-view';
}

export function getLocalEntryIcon(entry: LocalEntry): IconType {
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
 * Constructs a data source name based on state.
 *
 * Doesn't do any consistency checks, assumes all maps are consistent.
 */
export function getFlatFileDataSourceName(
  dataSource: AnyFlatFileDataSource,
  localEntries: Map<LocalEntryId, LocalEntry>,
): string;
/**
 * Constructs a data source name based on state.
 */
export function getFlatFileDataSourceName(
  dataSource: AnyFlatFileDataSource,
  localEntry: LocalEntry,
): string;
export function getFlatFileDataSourceName(
  dataSource: AnyFlatFileDataSource,
  localEntriesOrEntry: Map<LocalEntryId, LocalEntry> | LocalEntry,
): string {
  let localEntry: LocalEntry;

  if (localEntriesOrEntry instanceof Map) {
    localEntry = localEntriesOrEntry.get(dataSource.fileSourceId)!;
  } else {
    localEntry = localEntriesOrEntry;
  }

  return localEntry.uniqueAlias === dataSource.viewName
    ? dataSource.viewName
    : `${dataSource.viewName} (${localEntry.uniqueAlias})`;
}

export function getAttachedDBDataSourceName(dbName: string, localEntry: LocalEntry): string {
  return localEntry.uniqueAlias === dbName ? dbName : `${dbName} (${localEntry.uniqueAlias})`;
}

export function getDataSourceIcon(dataSource: AnyFlatFileDataSource): IconType {
  return dataSource.type;
}
