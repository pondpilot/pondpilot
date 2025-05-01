import { IconType } from '@components/named-icon';
import { AnyDataSource, AnyFlatFileDataSource, PersistentDataSourceId } from '@models/data-source';
import { LocalEntry, LocalEntryId, LocalFile, LocalFolder } from '@models/file-system';
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

  return getFlatFileDataSourceName(dataSource, localEntries, { nonAliased: true });
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
    return getFlatFileDataSourceIcon(dataSource);
  }

  // AttachedDBDataTab
  return tab.objectType === 'table' ? 'db-table' : 'db-view';
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
          : entry.ext === 'xlsx'
            ? 'xlsx'
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
  options?: { nonAliased?: boolean },
): string;
/**
 * Constructs a data source name based on state.
 */
export function getFlatFileDataSourceName(
  dataSource: AnyFlatFileDataSource,
  localEntry: LocalEntry,
  options?: { nonAliased?: boolean },
): string;
export function getFlatFileDataSourceName(
  dataSource: AnyFlatFileDataSource,
  localEntriesOrEntry: Map<LocalEntryId, LocalEntry> | LocalEntry,
  options?: { nonAliased?: boolean },
): string {
  let localEntry: LocalEntry;

  if (localEntriesOrEntry instanceof Map) {
    localEntry = localEntriesOrEntry.get(dataSource.fileSourceId)!;
  } else {
    localEntry = localEntriesOrEntry;
  }

  if (dataSource.type === 'xlsx-sheet') {
    return options?.nonAliased
      ? dataSource.viewName
      : `${dataSource.viewName} (${localEntry.name}::${dataSource.sheetName})`;
  }

  return localEntry.name === dataSource.viewName || options?.nonAliased
    ? dataSource.viewName
    : `${dataSource.viewName} (${localEntry.name})`;
}

export function getAttachedDBDataSourceName(dbName: string, entry: LocalEntry): string {
  return entry.name === dbName ? dbName : `${dbName} (${entry.name})`;
}

export function getFolderName(entry: LocalFolder): string {
  return entry.name === entry.uniqueAlias ? entry.name : `${entry.uniqueAlias} (${entry.name})`;
}

export function getXlsxFileName(entry: LocalFile): string {
  return entry.name === entry.uniqueAlias ? entry.name : `${entry.uniqueAlias} (${entry.name})`;
}

export function getFlatFileDataSourceIcon(dataSource: AnyFlatFileDataSource): IconType {
  return dataSource.type;
}
