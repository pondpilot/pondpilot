import { ConnectionPool } from '@engines/types';
import { PersistentDataSourceId, AnyFlatFileDataSource } from '@models/data-source';
import { LocalEntryId, LocalEntry } from '@models/file-system';
import { SchemaBrowserTab } from '@models/tab';

import { processMultipleFileSources } from './common';
import { SchemaGraph } from '../../model';

/**
 * Process schema for folder containing multiple files
 */
export async function processFolderSource(
  tab: Omit<SchemaBrowserTab, 'dataViewStateCache'>,
  pool: ConnectionPool,
  localEntries: Map<LocalEntryId, LocalEntry>,
  flatFileSources: Map<PersistentDataSourceId, AnyFlatFileDataSource>,
  abortSignal: AbortSignal,
): Promise<SchemaGraph> {
  if (!tab.sourceId) {
    return {
      nodes: [],
      edges: [],
    };
  }

  const folderEntry = localEntries.get(tab.sourceId as LocalEntryId);

  if (folderEntry && folderEntry.kind === 'directory') {
    // Find all data sources within this folder
    const sourcesInFolder: PersistentDataSourceId[] = [];

    // Collect data source IDs from flat files in this folder
    localEntries.forEach((entry: LocalEntry) => {
      if (entry.parentId === tab.sourceId) {
        // Find associated data source
        flatFileSources.forEach((source: AnyFlatFileDataSource) => {
          if (source.fileSourceId === entry.id) {
            sourcesInFolder.push(source.id);
          }
        });
      }
    });

    // Process all sources using the common utility
    return processMultipleFileSources(
      sourcesInFolder,
      flatFileSources,
      pool,
      abortSignal,
      'circle', // Use circle layout for folder contents
    );
  }

  return {
    nodes: [],
    edges: [],
  };
}
