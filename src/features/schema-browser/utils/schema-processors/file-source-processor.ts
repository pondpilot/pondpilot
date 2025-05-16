import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { PersistentDataSourceId, AnyFlatFileDataSource } from '@models/data-source';
import { SchemaBrowserTab } from '@models/tab';

import { DEFAULT_NODE_POSITION } from '../../constants';
import { SchemaGraph } from '../../model';
import { extractFlatFileSchema, createSchemaNode } from '../schema-extraction';

/**
 * Process schema for individual file source
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

  if (tab.sourceId && flatFileSources.has(tab.sourceId as PersistentDataSourceId)) {
    const source = flatFileSources.get(tab.sourceId as PersistentDataSourceId)!;

    const nodeData = await extractFlatFileSchema(source, pool, abortSignal);

    if (nodeData) {
      const node = createSchemaNode(nodeData, DEFAULT_NODE_POSITION);
      schemaGraph.nodes.push(node);
    }
  }

  return schemaGraph;
}
