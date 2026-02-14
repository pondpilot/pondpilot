import { IconType } from '@components/named-icon';
import { Comparison, ComparisonId } from '@models/comparison';
import { AnyDataSource, AnyFlatFileDataSource, PersistentDataSourceId } from '@models/data-source';
import { LocalEntry, LocalEntryId, LocalFile, LocalFolder } from '@models/file-system';
import { SQLScript, SQLScriptId } from '@models/sql-script';
import { AnyTab } from '@models/tab';
import { getDatabaseIdentifier } from '@utils/data-source';

import { getSchemaBrowserTabTitle } from './tab-titles';

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
  comparisons: Map<ComparisonId, Comparison>,
): string {
  // ScriptTab
  if (tab.type === 'script') {
    return sqlScripts.get(tab.sqlScriptId)?.name || 'Unknown script';
  }

  // Schema Browser tab
  if (tab.type === 'schema-browser') {
    return getSchemaBrowserTabTitle(tab, dataSources, localEntries);
  }

  // Comparison tab
  if (tab.type === 'comparison') {
    return comparisons.get(tab.comparisonId)?.name || 'Unknown comparison';
  }

  // Data source tabs
  const dataSource = dataSources.get(tab.dataSourceId);

  if (!dataSource) {
    return 'Unknown data source';
  }

  // Database objects (local attached, remote, and iceberg catalog)
  if (tab.dataSourceType === 'db') {
    if (
      dataSource.type !== 'attached-db' &&
      dataSource.type !== 'remote-db' &&
      dataSource.type !== 'iceberg-catalog' &&
      dataSource.type !== 'motherduck'
    ) {
      return 'Unknown data source';
    }

    const dbIdentifier = getDatabaseIdentifier(dataSource);
    return `${dbIdentifier}.${tab.schemaName}.${tab.objectName}`;
  }

  // Flat files
  if (
    dataSource.type === 'attached-db' ||
    dataSource.type === 'remote-db' ||
    dataSource.type === 'iceberg-catalog' ||
    dataSource.type === 'motherduck'
  ) {
    return 'Unknown data source';
  }

  return getFlatFileDataSourceName(dataSource as AnyFlatFileDataSource, localEntries, {
    nonAliased: true,
  });
}

export function getTabIcon(
  tab: AnyTab,
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
): IconType {
  if (tab.type === 'script') {
    return 'code-file';
  }

  if (tab.type === 'schema-browser') {
    return 'db-schema';
  }

  if (tab.type === 'comparison') {
    return 'comparison';
  }

  if (tab.type === 'data-source' && tab.dataSourceType === 'file') {
    const dataSource = dataSources.get(tab.dataSourceId);

    if (
      !dataSource ||
      dataSource.type === 'attached-db' ||
      dataSource.type === 'remote-db' ||
      dataSource.type === 'iceberg-catalog' ||
      dataSource.type === 'motherduck'
    ) {
      return 'error';
    }
    return getFlatFileDataSourceIcon(dataSource as AnyFlatFileDataSource);
  }

  // AttachedDBDataTab
  if (tab.type === 'data-source' && tab.dataSourceType === 'db') {
    return tab.objectType === 'table' ? 'db-table' : 'db-view';
  }

  return 'error';
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

export function getLocalDBDataSourceName(dbName: string, entry: LocalEntry): string {
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
