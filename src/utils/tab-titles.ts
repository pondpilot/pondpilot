import { AnyDataSource, PersistentDataSourceId } from '@models/data-source';
import { LocalEntry, LocalEntryId } from '@models/file-system';
import { SchemaBrowserTab } from '@models/tab';

/**
 * Generates a title for a schema browser tab
 *
 * @param tab - The schema browser tab
 * @param dataSources - Map of data sources
 * @param localEntries - Map of local entries (files/folders)
 * @returns The formatted title for the tab
 */
export function getSchemaBrowserTabTitle(
  tab: Pick<SchemaBrowserTab, 'sourceType' | 'sourceId' | 'schemaName' | 'objectNames'>,
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
  localEntries: Map<LocalEntryId, LocalEntry>,
): string {
  const { sourceType, sourceId } = tab;

  if (sourceId === null) {
    return 'All Data Sources';
  }

  if (sourceType === 'folder') {
    const folderEntry = localEntries.get(sourceId as LocalEntryId);
    return folderEntry ? `Folder: ${folderEntry.uniqueAlias}` : 'Folder';
  }

  if (sourceType === 'file') {
    const dataSource = dataSources.get(sourceId as PersistentDataSourceId);
    if (dataSource && dataSource.type !== 'attached-db') {
      return `File: ${dataSource.viewName}`;
    }
    return 'File';
  }

  if (sourceType === 'db') {
    const dataSource = dataSources.get(sourceId as PersistentDataSourceId);
    if (dataSource && dataSource.type === 'attached-db') {
      let tabName = `Database: ${dataSource.dbName}`;

      // Add schema if specified
      if (tab.schemaName) {
        tabName = `Schema: ${dataSource.dbName}.${tab.schemaName}`;
      }

      // Add object names if specified
      if (tab.objectNames && tab.objectNames.length > 0) {
        if (tab.objectNames.length === 1) {
          tabName = `Table: ${dataSource.dbName}.${tab.schemaName}.${tab.objectNames[0]}`;
        } else {
          tabName = `Tables: ${dataSource.dbName}.${tab.schemaName} (${tab.objectNames.length} selected)`;
        }
      }

      return tabName;
    }
    return 'Database';
  }

  if (sourceType === 'all') {
    return 'All Data Sources';
  }

  return 'Schema View';
}

/**
 * Generates a detailed title for schema browser display
 * This version returns JSX-friendly content
 *
 * @param tab - The schema browser tab
 * @param dataSources - Map of data sources
 * @param localEntries - Map of local entries (files/folders)
 * @returns Object with prefix and main title parts
 */
export function getSchemaBrowserDisplayTitle(
  tab: Pick<SchemaBrowserTab, 'sourceType' | 'sourceId' | 'schemaName' | 'objectNames'>,
  dataSources: Map<PersistentDataSourceId, AnyDataSource>,
  localEntries: Map<LocalEntryId, LocalEntry>,
): { prefix?: string; title: string } {
  const { sourceType, sourceId } = tab;

  if (sourceId === null) {
    return { title: 'All Data Sources' };
  }

  if (sourceType === 'folder') {
    const folderEntry = localEntries.get(sourceId as LocalEntryId);
    return {
      prefix: 'Folder:',
      title: folderEntry ? folderEntry.uniqueAlias : 'Unknown',
    };
  }

  if (sourceType === 'file') {
    const dataSource = dataSources.get(sourceId as PersistentDataSourceId);
    if (dataSource && dataSource.type !== 'attached-db') {
      return {
        prefix: 'File:',
        title: dataSource.viewName,
      };
    }
    return { prefix: 'File:', title: 'Unknown' };
  }

  if (sourceType === 'db') {
    const dataSource = dataSources.get(sourceId as PersistentDataSourceId);
    if (dataSource && dataSource.type === 'attached-db') {
      const { dbName } = dataSource;

      if (tab.schemaName) {
        if (tab.objectNames && tab.objectNames.length > 0) {
          if (tab.objectNames.length === 1) {
            return {
              prefix: 'Table:',
              title: `${dbName}.${tab.schemaName}.${tab.objectNames[0]}`,
            };
          }
            return {
              prefix: 'Tables:',
              title: `${dbName}.${tab.schemaName} (${tab.objectNames.length} selected)`,
            };
        }
        return { prefix: 'Schema:', title: `${dbName}.${tab.schemaName}` };
      }
      return { prefix: 'Database:', title: dbName };
    }
    return { prefix: 'Database:', title: 'Unknown' };
  }

  if (sourceType === 'all') {
    return { title: 'All Data Sources' };
  }

  return { title: 'Unknown' };
}
