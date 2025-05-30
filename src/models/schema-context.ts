export interface SchemaContextConfig {
  maxTotalSize: number; // Maximum total characters for schema context
  maxTablesPerSchema: number; // Maximum tables/views per schema
  maxColumnsPerTable: number; // Maximum columns per table/view
  prioritizeReferencedTables: boolean; // Prioritize tables mentioned in SQL
  includeColumnTypes: boolean; // Include column data types
  includeNullability: boolean; // Include nullable information
  includeIndexes: boolean; // Include index information (future)
}

export interface SchemaContextTable {
  name: string;
  type: 'table' | 'view';
  columns: SchemaContextColumn[];
  priority: number;
  estimatedSize: number;
}

export interface SchemaContextColumn {
  name: string;
  type?: string;
  nullable?: boolean;
  isPrimaryKey?: boolean;
}

export interface SchemaContextSchema {
  name: string;
  tables: SchemaContextTable[];
  estimatedSize: number;
}

export interface SchemaContext {
  schemas: SchemaContextSchema[];
  totalSize: number;
  truncated: boolean;
  includedTables: string[];
  excludedTables: string[];
}

export const DEFAULT_SCHEMA_CONTEXT_CONFIG: SchemaContextConfig = {
  maxTotalSize: 2000, // Keep schema context under 2KB
  maxTablesPerSchema: 20,
  maxColumnsPerTable: 30,
  prioritizeReferencedTables: true,
  includeColumnTypes: true,
  includeNullability: true,
  includeIndexes: false,
};
