import { Edge } from 'reactflow';

import { SchemaNodeData, SchemaEdgeData } from '@features/schema-browser/model';

/**
 * Create an edge between two tables based on a foreign key relationship
 *
 * @param sourceTable - The source table with the foreign key
 * @param targetTable - The target table being referenced
 * @param sourceColumn - The column with the foreign key
 * @returns A ReactFlow edge with proper source/target handles for column-to-column connections
 *
 * @example
 * ```ts
 * const edge = createForeignKeyEdge(ordersTable, customersTable, {
 *   name: 'customer_id',
 *   referencesColumn: 'id'
 * });
 * ```
 */
export function createForeignKeyEdge(
  sourceTable: SchemaNodeData,
  targetTable: SchemaNodeData,
  sourceColumn: { name: string; referencesColumn?: string },
): Edge<SchemaEdgeData> {
  return {
    id: `${sourceTable.id}-${targetTable.id}-${sourceColumn.name}`,
    source: sourceTable.id,
    target: targetTable.id,
    sourceHandle: `${sourceTable.label}-${sourceColumn.name}`,
    targetHandle: `${targetTable.label}-${sourceColumn.referencesColumn}-target`,
    animated: false,
    type: 'angled',
    label: sourceColumn.name,
  };
}

/**
 * Find the target table for a foreign key relationship
 *
 * Handles various reference formats:
 * - Direct table name: 'customers'
 * - Schema-qualified: 'public.customers'
 * - Fully qualified: 'main.public.customers'
 *
 * @param tables - All available tables
 * @param referencesTable - The name or qualified name of the referenced table
 * @returns The target table data or undefined if not found
 *
 * @example
 * ```ts
 * const targetTable = findTargetTable(allTables, 'public.customers');
 * ```
 */
export function findTargetTable(
  tables: SchemaNodeData[],
  referencesTable: string,
): SchemaNodeData | undefined {
  return tables.find((table) => {
    // Direct match
    if (table.label === referencesTable || table.objectName === referencesTable) {
      return true;
    }

    // Check if the reference includes schema
    if (referencesTable.includes('.')) {
      const [refSchema, refTable] = referencesTable.split('.');
      return table.objectName === refTable && table.schemaName === refSchema;
    }

    // Check if table name matches without schema
    const tableNameParts = referencesTable.split('.');
    const tableName = tableNameParts[tableNameParts.length - 1];
    return table.label === tableName || table.objectName === tableName;
  });
}

/**
 * Create all foreign key edges for a set of tables
 *
 * Iterates through all tables and their columns to find foreign key relationships
 * and creates edges for valid connections.
 *
 * @param tables - All tables with their columns
 * @returns Array of ReactFlow edges for foreign key relationships
 *
 * @example
 * ```ts
 * const edges = createForeignKeyEdges(schemaData.nodes);
 * // Returns edges connecting foreign keys to their referenced primary keys
 * ```
 */
export function createForeignKeyEdges(tables: SchemaNodeData[]): Edge<SchemaEdgeData>[] {
  const edges: Edge<SchemaEdgeData>[] = [];

  tables.forEach((sourceTable) => {
    sourceTable.columns.forEach((sourceColumn) => {
      if (sourceColumn.isForeignKey && sourceColumn.referencesTable) {
        const targetTable = findTargetTable(tables, sourceColumn.referencesTable);

        if (targetTable && sourceColumn.referencesColumn) {
          // Find the target column
          const targetColumn = targetTable.columns.find(
            (col) => col.name === sourceColumn.referencesColumn,
          );

          if (targetColumn) {
            edges.push(createForeignKeyEdge(sourceTable, targetTable, sourceColumn));
          }
        }
      }
    });
  });

  return edges;
}
