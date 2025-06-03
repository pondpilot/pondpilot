import { PersistentDataSourceId } from '@models/data-source';
import { DBColumn } from '@models/db';
import { LocalEntryId } from '@models/file-system';
import { Node, Edge } from 'reactflow';

// Node data structure for schema visualization
export interface SchemaNodeData {
  // Entity information
  id: string;
  label: string;
  type: 'table' | 'view' | 'datasource';
  sourceId: PersistentDataSourceId | LocalEntryId;
  sourceType: 'file' | 'db' | 'folder';

  // Schema information
  columns: SchemaColumnData[];
  schemaName?: string;
  objectName?: string;

  // Visual state
  isHighlighted?: boolean;
  highlightedColumns?: string[];
  isSelected?: boolean;
}

// Column information for schema nodes
export interface SchemaColumnData {
  name: string;
  sqlType: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNotNull?: boolean;
  referencesTable?: string;
  referencesColumn?: string;
}

// Edge data for schema visualization
export interface SchemaEdgeData {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  type?: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

// Complete schema graph representation
export interface SchemaGraph {
  nodes: Node<SchemaNodeData>[];
  edges: Edge<SchemaEdgeData>[];
}

// Convert DB column to schema column data
export function dbColumnToSchemaColumn(column: DBColumn): SchemaColumnData {
  return {
    name: column.name,
    sqlType: column.sqlType,
    isPrimaryKey: false, // To be determined by analysis
    isForeignKey: false, // To be determined by analysis
  };
}
