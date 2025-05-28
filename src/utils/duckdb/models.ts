/**
 * Type definitions for DuckDB query results
 */

/**
 * Result row from DESCRIBE query
 */
export interface DescribeResult {
  column_name: string;
  column_type: string;
  // Other columns may exist but aren't used
}

/**
 * Vector type returned by DuckDB for array-like columns
 */
export interface DuckDBVector<T = string> {
  toArray?: () => T[];
  get?: (index: number) => T;
  length?: number;
}

/**
 * Result row from duckdb_constraints() query
 */
export interface ConstraintResult {
  database_name: string;
  schema_name: string;
  table_name: string;
  constraint_type: string; // 'PRIMARY KEY', 'FOREIGN KEY', 'NOT NULL'
  constraint_column_names: DuckDBVector<string> | string[];
  referenced_table?: string;
  referenced_column_names?: DuckDBVector<string> | string[];
}
