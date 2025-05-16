import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { PersistentDataSourceId, AnyFlatFileDataSource } from '@models/data-source';
import { LocalEntryId, LocalEntry } from '@models/file-system';
import { SchemaBrowserTab } from '@models/tab';

import { SchemaGraph, SchemaNodeData } from '../../model';
import { createForeignKeyEdges } from '../edges';
import { generateNodePosition } from '../node-positioning';
import { extractFlatFileSchema, createSchemaNode } from '../schema-extraction';

/**
 * Process schema for folder containing multiple files
 */
export async function processFolderSource(
  tab: Omit<SchemaBrowserTab, 'dataViewStateCache'>,
  pool: AsyncDuckDBConnectionPool,
  localEntries: Map<LocalEntryId, LocalEntry>,
  flatFileSources: Map<PersistentDataSourceId, AnyFlatFileDataSource>,
  abortSignal: AbortSignal,
): Promise<SchemaGraph> {
  const schemaGraph: SchemaGraph = {
    nodes: [],
    edges: [],
  };

  if (tab.sourceId) {
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

      // Process each data source in the folder
      let nodeIndex = 0;
      const processedSources: SchemaNodeData[] = [];

      for (const sourceId of sourcesInFolder) {
        const source = flatFileSources.get(sourceId);
        if (source) {
          try {
            const nodeData = await extractFlatFileSchema(source, pool, abortSignal);

            if (nodeData) {
              // Generate position in a visual layout
              const position = generateNodePosition(nodeIndex, sourcesInFolder.length);
              nodeIndex += 1;

              const node = createSchemaNode(nodeData, position);
              schemaGraph.nodes.push(node);
              processedSources.push(nodeData);
            }
          } catch (processError) {
            const errorMessage = `Error processing schema for ${source.viewName}: ${
              processError instanceof Error ? processError.message : 'Unknown error'
            }`;
            console.error(errorMessage);
            // Continue processing other sources but track errors
          }
        }
      }

      // Create edges based on foreign key relationships
      const folderEdges = createForeignKeyEdges(processedSources);
      schemaGraph.edges.push(...folderEdges);
    }
  }

  return schemaGraph;
}
