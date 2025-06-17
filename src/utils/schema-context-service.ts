import { PERSISTENT_DB_NAME } from '@models/db-persistence';

import { getDatabaseModel } from '../controllers/db/duckdb-meta';
import { AsyncDuckDBConnectionPool } from '../features/duckdb-context/duckdb-connection-pool';
import { DBTableOrView } from '../models/db';
import {
  SchemaContext,
  SchemaContextConfig,
  SchemaContextTable,
  SchemaContextSchema,
  SchemaContextColumn,
  DEFAULT_SCHEMA_CONTEXT_CONFIG,
} from '../models/schema-context';

export class SchemaContextService {
  private config: SchemaContextConfig;

  constructor(config: Partial<SchemaContextConfig> = {}) {
    this.config = { ...DEFAULT_SCHEMA_CONTEXT_CONFIG, ...config };
  }

  /**
   * Extract table/view names referenced in SQL statement using DuckDB's parser
   */
  private async extractReferencedTables(
    conn: AsyncDuckDBConnectionPool,
    sqlStatement?: string,
  ): Promise<string[]> {
    if (!sqlStatement) return [];

    try {
      // Use DuckDB's getTableNames API to get accurate table references
      const pooledConn = await conn.getPooledConnection();
      try {
        const tableNames = await pooledConn.getTableNames(sqlStatement);

        // If getTableNames returns empty, fall back to regex
        if (tableNames.length === 0) {
          const regexResult = this.extractReferencedTablesRegex(sqlStatement);
          return regexResult;
        }

        const normalized = tableNames.map((name: string) => name.toLowerCase());
        return normalized;
      } finally {
        await pooledConn.close();
      }
    } catch (error) {
      // Fallback to regex-based extraction if getTableNames fails
      const regexResult = this.extractReferencedTablesRegex(sqlStatement);
      return regexResult;
    }
  }

  /**
   * Fallback regex-based table extraction
   */
  private extractReferencedTablesRegex(sqlStatement: string): string[] {
    const patterns = [
      /\bFROM\s+([`"']?)(\w+)\1(?:\s+(?:AS\s+)?([`"']?)(\w+)\3)?/gi,
      /\bJOIN\s+([`"']?)(\w+)\1(?:\s+(?:AS\s+)?([`"']?)(\w+)\3)?/gi,
      /\bINTO\s+([`"']?)(\w+)\1/gi,
      /\bUPDATE\s+([`"']?)(\w+)\1/gi,
      /\bINSERT\s+INTO\s+([`"']?)(\w+)\1/gi,
      /\bDELETE\s+FROM\s+([`"']?)(\w+)\1/gi,
      /\bWITH\s+(\w+)\s+AS/gi,
    ];

    const tableNames = new Set<string>();

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(sqlStatement)) !== null) {
        // Extract table name (group 2 for most patterns)
        const tableName = match[2];
        if (
          tableName &&
          !['SELECT', 'WHERE', 'ORDER', 'GROUP', 'HAVING'].includes(tableName.toUpperCase())
        ) {
          tableNames.add(tableName.toLowerCase());
        }
      }
    });

    return Array.from(tableNames);
  }

  /**
   * Find tables that are directly related to the given tables through foreign keys
   */
  private findRelatedTables(referencedTables: string[], databaseModel: Map<string, any>): string[] {
    const relatedTables = new Set<string>();

    // For each referenced table, find tables that reference it or are referenced by it
    for (const [_dbName, database] of databaseModel.entries()) {
      for (const schema of database.schemas) {
        for (const table of schema.objects) {
          const tableLower = table.name.toLowerCase();
          const isReferenced = referencedTables.some(
            (ref) => ref === tableLower || ref.endsWith(`.${tableLower}`),
          );

          if (isReferenced) {
            // Look for foreign key relationships in column names
            for (const column of table.columns) {
              const colName = column.name.toLowerCase();
              // Common FK patterns: table_id, fk_table, table_fk, etc.
              const fkPatterns = [/_id$/, /^fk_/, /_fk$/, /^id_/];

              if (fkPatterns.some((pattern) => pattern.test(colName))) {
                // Extract potential table name from FK column
                const potentialTable = colName
                  .replace(/^fk_/, '')
                  .replace(/_fk$/, '')
                  .replace(/_id$/, '')
                  .replace(/^id_/, '');

                if (potentialTable && potentialTable !== tableLower) {
                  relatedTables.add(potentialTable);
                }
              }
            }
          }

          // Also check if this table references any of our referenced tables
          for (const column of table.columns) {
            const colName = column.name.toLowerCase();

            for (const refTable of referencedTables) {
              const refTableName = refTable.split('.').pop() || refTable;
              if (
                colName === `${refTableName}_id` ||
                colName === `fk_${refTableName}` ||
                colName === `${refTableName}_fk` ||
                colName === `id_${refTableName}`
              ) {
                relatedTables.add(tableLower);
              }
            }
          }
        }
      }
    }

    // Remove any tables that are already in the referenced list
    referencedTables.forEach((ref) => {
      relatedTables.delete(ref.toLowerCase());
      relatedTables.delete(ref.split('.').pop()?.toLowerCase() || '');
    });

    return Array.from(relatedTables);
  }

  /**
   * Calculate priority score for a table based on context
   */
  private calculateTablePriority(
    table: DBTableOrView,
    referencedTables: string[],
    schemaName: string,
  ): number {
    let priority = 0;

    // Much higher priority for referenced tables (these are the most relevant)
    const tableLower = table.name.toLowerCase();
    const schemaQualifiedName = `${schemaName}.${tableLower}`;

    const isReferenced =
      referencedTables.includes(tableLower) ||
      referencedTables.includes(schemaQualifiedName) ||
      referencedTables.some((ref) => ref.endsWith(`.${tableLower}`));

    if (isReferenced) {
      priority += 1000;
    }

    // Slightly higher priority for tables vs views
    if (table.type === 'table') {
      priority += 5;
    }

    // Higher priority for main schema
    if (schemaName === 'main') {
      priority += 10;
    }

    // Lower priority for tables with many columns (likely less focused)
    if (table.columns.length > 20) {
      priority -= 5;
    }

    return priority;
  }

  /**
   * Estimate the character size of a table's schema representation
   */
  private estimateTableSize(table: DBTableOrView): number {
    let size = table.name.length + 20; // Base size for table name and formatting

    table.columns.forEach((column) => {
      size += column.name.length + 5; // Column name + comma + space
      if (this.config.includeColumnTypes) {
        size += column.databaseType.length + 3; // Type + parentheses
      }
      if (this.config.includeNullability) {
        size += column.nullable ? 8 : 12; // " NULL" or " NOT NULL"
      }
    });

    return size;
  }

  /**
   * Convert database table to schema context table
   */
  private convertToSchemaContextTable(table: DBTableOrView, priority: number): SchemaContextTable {
    const columns: SchemaContextColumn[] = table.columns
      .slice(0, this.config.maxColumnsPerTable)
      .map((column) => ({
        name: column.name,
        type: this.config.includeColumnTypes ? column.databaseType : undefined,
        nullable: this.config.includeNullability ? column.nullable : undefined,
      }));

    return {
      name: table.name,
      type: table.type,
      columns,
      priority,
      estimatedSize: this.estimateTableSize(table),
    };
  }

  /**
   * Generate schema context from database model with 3 sections:
   * 1. Full info for tables used in SQL statement
   * 2. Tables directly related to section 1
   * 3. Other tables using priority logic
   */
  async generateSchemaContext(
    conn: AsyncDuckDBConnectionPool,
    sqlStatement?: string,
    mentionedTables?: string[],
  ): Promise<SchemaContext> {
    // Combine referenced tables from SQL and explicitly mentioned tables
    const referencedTables = await this.extractReferencedTables(conn, sqlStatement);
    if (mentionedTables && mentionedTables.length > 0) {
      // Add mentioned tables to referenced tables (deduplicate)
      const allTables = new Set([
        ...referencedTables,
        ...mentionedTables.map((t) => t.toLowerCase()),
      ]);
      referencedTables.length = 0;
      referencedTables.push(...Array.from(allTables));
    }

    const databaseModel = await getDatabaseModel(conn);
    const relatedTables = this.findRelatedTables(referencedTables, databaseModel);

    const schemas: SchemaContextSchema[] = [];
    let totalSize = 0;
    const includedTables: string[] = [];
    const excludedTables: string[] = [];

    // Collect all tables and categorize them
    const section1Tables: Array<{ dbName: string; schema: any; table: DBTableOrView }> = [];
    const section2Tables: Array<{ dbName: string; schema: any; table: DBTableOrView }> = [];
    const section3Tables: Array<{ dbName: string; schema: any; table: DBTableOrView }> = [];

    for (const [dbName, database] of databaseModel.entries()) {
      for (const schema of database.schemas) {
        for (const table of schema.objects) {
          const tableLower = table.name.toLowerCase();

          if (
            referencedTables.some((ref) => ref === tableLower || ref.endsWith(`.${tableLower}`))
          ) {
            section1Tables.push({ dbName, schema, table });
          } else if (relatedTables.includes(tableLower)) {
            section2Tables.push({ dbName, schema, table });
          } else {
            section3Tables.push({ dbName, schema, table });
          }
        }
      }
    }

    // Tables are now categorized into 3 sections

    // Process tables in 3 sections
    const processedSchemas = new Map<string, SchemaContextSchema>();

    // Helper function to add table to schema
    const addTableToSchema = (
      dbName: string,
      schemaObj: any,
      table: DBTableOrView,
      priority: number,
    ) => {
      const schemaKey = `${dbName}.${schemaObj.name}`;
      const schemaName =
        schemaObj.name === 'main' && dbName === PERSISTENT_DB_NAME ? 'main' : schemaKey;

      if (!processedSchemas.has(schemaKey)) {
        processedSchemas.set(schemaKey, {
          name: schemaName,
          tables: [],
          estimatedSize: 0,
        });
      }

      const schemaContext = processedSchemas.get(schemaKey)!;
      const contextTable = this.convertToSchemaContextTable(table, priority);

      // Check size limits
      if (
        totalSize + contextTable.estimatedSize <= this.config.maxTotalSize &&
        schemaContext.tables.length < this.config.maxTablesPerSchema
      ) {
        schemaContext.tables.push(contextTable);
        schemaContext.estimatedSize += contextTable.estimatedSize;
        totalSize += contextTable.estimatedSize;
        includedTables.push(`${dbName}.${schemaObj.name}.${table.name}`);
        return true;
      }
      excludedTables.push(`${dbName}.${schemaObj.name}.${table.name}`);
      return false;
    };

    // Section 1: Referenced tables (highest priority - include ALL columns)
    for (const { dbName, schema, table } of section1Tables) {
      addTableToSchema(dbName, schema, table, 10000);
    }

    // Section 2: Related tables (high priority)
    for (const { dbName, schema, table } of section2Tables) {
      addTableToSchema(dbName, schema, table, 5000);
    }

    // Section 3: Other tables (use normal priority calculation)
    // Sort by priority first
    const sortedSection3 = section3Tables
      .map(({ dbName, schema, table }) => ({
        dbName,
        schema,
        table,
        priority: this.calculateTablePriority(table, referencedTables, schema.name),
      }))
      .sort((a, b) => b.priority - a.priority);

    for (const { dbName, schema, table, priority } of sortedSection3) {
      if (totalSize >= this.config.maxTotalSize * 0.8) break; // Leave some buffer
      addTableToSchema(dbName, schema, table, priority);
    }

    // Convert map to array
    schemas.push(...processedSchemas.values());

    return {
      schemas,
      totalSize,
      truncated: excludedTables.length > 0,
      includedTables,
      excludedTables,
    };
  }

  /**
   * Format schema context as text for AI consumption with 3 sections
   */
  formatSchemaContextForAI(schemaContext: SchemaContext): string {
    if (schemaContext.schemas.length === 0) {
      return 'No database schema available.';
    }

    let formatted = 'Database Schema:\n';

    // Group tables by priority to identify sections
    const allTables: Array<{ schema: string; table: SchemaContextTable }> = [];
    schemaContext.schemas.forEach((schema) => {
      schema.tables.forEach((table) => {
        allTables.push({ schema: schema.name, table });
      });
    });

    // Sort by priority to group into sections
    allTables.sort((a, b) => b.table.priority - a.table.priority);

    // Identify section boundaries based on priority ranges
    const section1Tables = allTables.filter((t) => t.table.priority >= 10000);
    const section2Tables = allTables.filter(
      (t) => t.table.priority >= 5000 && t.table.priority < 10000,
    );
    const section3Tables = allTables.filter((t) => t.table.priority < 5000);

    // Format Section 1: Tables referenced in SQL
    if (section1Tables.length > 0) {
      formatted += '\n## Section 1: Tables Referenced in Query\n';
      formatted += '*These tables are directly used in your SQL statement*\n';

      section1Tables.forEach(({ schema, table }) => {
        formatted += `\n### ${table.type.toUpperCase()}: ${schema}.${table.name}\n`;
        formatted += 'Columns:\n';
        table.columns.forEach((column) => {
          let columnLine = `- ${column.name}`;
          if (column.type) {
            columnLine += `: ${column.type}`;
          }
          if (column.nullable !== undefined) {
            columnLine += column.nullable ? ' (nullable)' : ' (not null)';
          }
          formatted += `${columnLine}\n`;
        });
      });
    }

    // Format Section 2: Related tables
    if (section2Tables.length > 0) {
      formatted += '\n## Section 2: Related Tables\n';
      formatted += '*Tables that have foreign key relationships with referenced tables*\n';

      section2Tables.forEach(({ schema, table }) => {
        formatted += `\n### ${table.type.toUpperCase()}: ${schema}.${table.name}\n`;
        formatted += 'Columns:\n';
        table.columns.forEach((column) => {
          let columnLine = `- ${column.name}`;
          if (column.type) {
            columnLine += `: ${column.type}`;
          }
          if (column.nullable !== undefined) {
            columnLine += column.nullable ? ' (nullable)' : ' (not null)';
          }
          formatted += `${columnLine}\n`;
        });
      });
    }

    // Format Section 3: Other tables
    if (section3Tables.length > 0) {
      formatted += '\n## Section 3: Other Available Tables\n';
      formatted += '*Additional tables in the database*\n';

      // Group by schema for section 3
      const bySchema = new Map<string, typeof section3Tables>();
      section3Tables.forEach((item) => {
        if (!bySchema.has(item.schema)) {
          bySchema.set(item.schema, []);
        }
        bySchema.get(item.schema)!.push(item);
      });

      bySchema.forEach((tables, schemaName) => {
        formatted += `\n### Schema: ${schemaName}\n`;
        tables.forEach(({ table }) => {
          formatted += `- ${table.type.toUpperCase()}: ${table.name}`;
          if (table.columns.length <= 5) {
            formatted += ` (${table.columns.map((c) => c.name).join(', ')})`;
          } else {
            formatted += ` (${table.columns.length} columns)`;
          }
          formatted += '\n';
        });
      });
    }

    if (schemaContext.truncated) {
      formatted += '\n*Note: Schema has been truncated due to size limits. ';
      formatted += `Showing ${schemaContext.includedTables.length} most relevant tables.*\n`;
    }

    return formatted;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SchemaContextConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Global instance
let schemaContextServiceInstance: SchemaContextService | null = null;

export function getSchemaContextService(
  config?: Partial<SchemaContextConfig>,
): SchemaContextService {
  if (!schemaContextServiceInstance) {
    schemaContextServiceInstance = new SchemaContextService(config);
  } else if (config) {
    schemaContextServiceInstance.updateConfig(config);
  }
  return schemaContextServiceInstance;
}
