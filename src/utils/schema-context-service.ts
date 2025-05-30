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
   * Extract table/view names referenced in SQL statement
   */
  private extractReferencedTables(sqlStatement?: string): string[] {
    if (!sqlStatement) return [];

    // Simple regex-based extraction - matches common table reference patterns
    // TODO: switch to a proper parser later
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
   * Calculate priority score for a table based on context
   */
  private calculateTablePriority(
    table: DBTableOrView,
    referencedTables: string[],
    schemaName: string,
  ): number {
    let priority = 0;

    // Higher priority for referenced tables
    if (referencedTables.includes(table.name.toLowerCase())) {
      priority += 100;
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
   * Generate schema context from database model
   */
  async generateSchemaContext(
    conn: AsyncDuckDBConnectionPool,
    sqlStatement?: string,
  ): Promise<SchemaContext> {
    const referencedTables = this.extractReferencedTables(sqlStatement);
    const databaseModel = await getDatabaseModel(conn);

    const schemas: SchemaContextSchema[] = [];
    let totalSize = 0;
    const includedTables: string[] = [];
    const excludedTables: string[] = [];

    // Process each database schema
    for (const [dbName, database] of databaseModel.entries()) {
      for (const schema of database.schemas) {
        const schemaContextTables: SchemaContextTable[] = [];

        // Convert and prioritize tables
        const prioritizedTables = schema.objects
          .map((table) => {
            const priority = this.calculateTablePriority(table, referencedTables, schema.name);
            return this.convertToSchemaContextTable(table, priority);
          })
          .sort((a, b) => b.priority - a.priority); // Sort by priority descending

        // Select tables within limits
        let schemaSize = 0;
        let tableCount = 0;

        for (const table of prioritizedTables) {
          // Check if adding this table would exceed limits
          if (
            tableCount >= this.config.maxTablesPerSchema ||
            totalSize + schemaSize + table.estimatedSize > this.config.maxTotalSize
          ) {
            excludedTables.push(`${dbName}.${schema.name}.${table.name}`);
            continue;
          }

          schemaContextTables.push(table);
          schemaSize += table.estimatedSize;
          tableCount += 1;
          includedTables.push(`${dbName}.${schema.name}.${table.name}`);
        }

        if (schemaContextTables.length > 0) {
          schemas.push({
            name:
              schema.name === 'main' && dbName === 'memory' ? 'main' : `${dbName}.${schema.name}`,
            tables: schemaContextTables,
            estimatedSize: schemaSize,
          });
          totalSize += schemaSize;
        }
      }
    }

    return {
      schemas,
      totalSize,
      truncated: excludedTables.length > 0,
      includedTables,
      excludedTables,
    };
  }

  /**
   * Format schema context as text for AI consumption
   */
  formatSchemaContextForAI(schemaContext: SchemaContext): string {
    if (schemaContext.schemas.length === 0) {
      return 'No database schema available.';
    }

    let formatted = 'Database Schema:\n';

    schemaContext.schemas.forEach((schema) => {
      formatted += `\n## Schema: ${schema.name}\n`;

      schema.tables.forEach((table) => {
        formatted += `\n### ${table.type.toUpperCase()}: ${table.name}\n`;
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
    });

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
