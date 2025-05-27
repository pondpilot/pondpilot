import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { PersistentDataSourceId, AnyFlatFileDataSource } from '@models/data-source';
import { SchemaBrowserTab } from '@models/tab';

import { DEFAULT_NODE_POSITION } from '../../constants';
import { SchemaGraph } from '../../model';
import { extractFlatFileSchema, createSchemaNode } from '../schema-extraction';

/**
 * Process schema for individual file source or multiple file sources
 */
export async function processFileSource(
  tab: Omit<SchemaBrowserTab, 'dataViewStateCache'>,
  pool: AsyncDuckDBConnectionPool,
  flatFileSources: Map<PersistentDataSourceId, AnyFlatFileDataSource>,
  abortSignal: AbortSignal,
): Promise<SchemaGraph> {
  const schemaGraph: SchemaGraph = {
    nodes: [],
    edges: [],
  };

  // Handle single file source
  if (tab.sourceId && flatFileSources.has(tab.sourceId as PersistentDataSourceId)) {
    const source = flatFileSources.get(tab.sourceId as PersistentDataSourceId)!;

    const nodeData = await extractFlatFileSchema(source, pool, abortSignal);

    if (nodeData) {
      const node = createSchemaNode(nodeData, DEFAULT_NODE_POSITION);
      schemaGraph.nodes.push(node);
    }
  } else if (!tab.sourceId && tab.objectNames && tab.objectNames.length > 0) {
    // Handle multiple file sources (passed in objectNames)
    // Process each file source ID in objectNames
    let yOffset = 0;
    for (const sourceId of tab.objectNames) {
      if (flatFileSources.has(sourceId as PersistentDataSourceId)) {
        const source = flatFileSources.get(sourceId as PersistentDataSourceId)!;

        const nodeData = await extractFlatFileSchema(source, pool, abortSignal);

        if (nodeData) {
          const position = { x: DEFAULT_NODE_POSITION.x, y: DEFAULT_NODE_POSITION.y + yOffset };
          const node = createSchemaNode(nodeData, position);
          schemaGraph.nodes.push(node);
          yOffset += 250; // Space nodes vertically
        }
      }
    }
  }

  return schemaGraph;
}
