import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { IcebergCatalog, LocalDB, RemoteDB, PersistentDataSourceId } from '@models/data-source';
import { DataBaseModel } from '@models/db';
import { SchemaBrowserTab } from '@models/tab';
import { getDatabaseIdentifier } from '@utils/data-source';

import { dbColumnToSchemaColumn, SchemaGraph, SchemaNodeData, SchemaColumnData } from '../../model';
import { getBatchTableConstraints } from '../batch-constraints';
import { createForeignKeyEdges } from '../edges';
import { generateNodePosition } from '../node-positioning';
import { createSchemaNode } from '../schema-extraction';

/**
 * Process schema for database source
 */
export async function processDbSource(
  tab: Omit<SchemaBrowserTab, 'dataViewStateCache'>,
  pool: AsyncDuckDBConnectionPool,
  dbSources: Map<PersistentDataSourceId, LocalDB | RemoteDB | IcebergCatalog>,
  dbMetadata: Map<string, DataBaseModel>,
  abortSignal: AbortSignal,
): Promise<SchemaGraph> {
  const schemaGraph: SchemaGraph = {
    nodes: [],
    edges: [],
  };

  if (tab.sourceId && dbSources.has(tab.sourceId as PersistentDataSourceId)) {
    const dbSource = dbSources.get(tab.sourceId as PersistentDataSourceId)!;
    const dbName = getDatabaseIdentifier(dbSource);
    const metadata = dbMetadata.get(dbName);

    if (metadata) {
      // Filter schemas if schemaName is specified
      const schemasToProcess = tab.schemaName
        ? metadata.schemas.filter((s: any) => s.name === tab.schemaName)
        : metadata.schemas;

      // Process schemas and tables
      let nodeIndex = 0;
      const totalNodes = schemasToProcess.reduce((count: number, schema: any) => {
        // Filter objects if objectNames are specified
        if (tab.objectNames && tab.objectNames.length > 0) {
          return (
            count + schema.objects.filter((obj: any) => tab.objectNames!.includes(obj.name)).length
          );
        }
        return count + schema.objects.length;
      }, 0);

      // Create nodes for each table/view
      for (const schema of schemasToProcess) {
        // Filter objects if objectNames are specified
        const objectsToProcess =
          tab.objectNames && tab.objectNames.length > 0
            ? schema.objects.filter((obj: any) => tab.objectNames!.includes(obj.name))
            : schema.objects;

        // Get constraint information for all tables in this schema in batch
        const tableNames = objectsToProcess.map((obj: any) => obj.name);
        const constraintMap = await getBatchTableConstraints(
          pool,
          dbName,
          schema.name,
          tableNames,
          abortSignal,
        );

        for (const obj of objectsToProcess) {
          // Get constraint information from the batch result
          const constraintInfo = constraintMap.get(obj.name) || {
            table: obj.name,
            primaryKeys: [] as string[],
            foreignKeys: new Map<string, { targetTable: string; targetColumn: string }>(),
            notNullColumns: [] as string[],
          };
          const {
            primaryKeys,
            foreignKeys: constraintForeignKeys,
            notNullColumns,
          } = constraintInfo;

          const columns: SchemaColumnData[] = obj.columns.map((col: any) => ({
            ...dbColumnToSchemaColumn(col),
            isPrimaryKey: primaryKeys && primaryKeys.includes(col.name),
            isForeignKey: constraintForeignKeys.has(col.name),
            isNotNull: notNullColumns && notNullColumns.includes(col.name),
            referencesTable: constraintForeignKeys.get(col.name)?.targetTable,
            referencesColumn: constraintForeignKeys.get(col.name)?.targetColumn,
          }));

          const nodeData: SchemaNodeData = {
            id: `${dbSource.id}.${schema.name}.${obj.name}`,
            label: obj.name,
            type: obj.type === 'table' ? 'table' : 'view',
            sourceId: dbSource.id,
            sourceType: 'db',
            columns,
            schemaName: schema.name,
            objectName: obj.name,
          };

          // Generate position for visual layout
          const position = generateNodePosition(nodeIndex, totalNodes);
          nodeIndex += 1;

          const node = createSchemaNode(nodeData, position);
          schemaGraph.nodes.push(node);
        }
      }

      // Create edges based on foreign key relationships
      const tables = schemaGraph.nodes.map((node) => node.data);
      const edges = createForeignKeyEdges(tables);
      schemaGraph.edges.push(...edges);
    }
  }

  return schemaGraph;
}
