import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { useState, useEffect, useCallback } from 'react';

interface SchemaInfo {
  tables: Array<{
    database: string;
    schema: string;
    name: string;
    type: 'table' | 'view';
    columns: Array<{
      name: string;
      type: string;
    }>;
  }>;
  isLoading: boolean;
  error?: string;
}

interface UseSchemaContextProps {
  connectionPool: AsyncDuckDBConnectionPool | null;
  enabled?: boolean;
}

export const useSchemaContext = ({ connectionPool, enabled = true }: UseSchemaContextProps) => {
  const [schemaInfo, setSchemaInfo] = useState<SchemaInfo>({
    tables: [],
    isLoading: false,
    error: undefined,
  });

  const fetchSchema = useCallback(async () => {
    if (!connectionPool || !enabled) {
      return;
    }

    setSchemaInfo((prev) => ({ ...prev, isLoading: true, error: undefined }));

    try {
      // Fetch all tables and views
      const tablesResult = await connectionPool.query(`
        SELECT 
          table_catalog as database,
          table_schema as schema,
          table_name as name,
          table_type as type
        FROM information_schema.tables
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY table_catalog, table_schema, table_name
      `);

      const tableRows = tablesResult.toArray();
      if (tableRows.length === 0) {
        setSchemaInfo({
          tables: [],
          isLoading: false,
        });
        return;
      }

      // Fetch columns for each table
      const tables = await Promise.all(
        tableRows.map(async (table: any) => {
          const columnsResult = await connectionPool.query(`
            SELECT 
              column_name as name,
              data_type as type
            FROM information_schema.columns
            WHERE table_catalog = '${table.database}'
              AND table_schema = '${table.schema}'
              AND table_name = '${table.name}'
            ORDER BY ordinal_position
          `);

          return {
            database: table.database,
            schema: table.schema,
            name: table.name,
            type: (table.type === 'VIEW' ? 'view' : 'table') as 'view' | 'table',
            columns: columnsResult.toArray() || [],
          };
        }),
      );

      setSchemaInfo({
        tables,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to fetch schema:', error);
      setSchemaInfo({
        tables: [],
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch schema',
      });
    }
  }, [connectionPool, enabled]);

  // Format schema as text for AI context
  const getSchemaAsText = useCallback((): string => {
    if (schemaInfo.tables.length === 0) {
      return '';
    }

    return schemaInfo.tables
      .map((table) => {
        const fullName = `${table.database}.${table.schema}.${table.name}`;
        const columns = table.columns.map((col) => `  - ${col.name} (${col.type})`).join('\n');

        return `${table.type.toUpperCase()}: ${fullName}\n${columns}`;
      })
      .join('\n\n');
  }, [schemaInfo.tables]);

  // Get simplified schema for display
  const getSimplifiedSchema = useCallback(() => {
    const databases = new Map<
      string,
      {
        schemas: Map<
          string,
          {
            tables: number;
            views: number;
          }
        >;
      }
    >();

    schemaInfo.tables.forEach((table) => {
      if (!databases.has(table.database)) {
        databases.set(table.database, { schemas: new Map() });
      }

      const db = databases.get(table.database)!;
      if (!db.schemas.has(table.schema)) {
        db.schemas.set(table.schema, { tables: 0, views: 0 });
      }

      const schema = db.schemas.get(table.schema)!;
      if (table.type === 'view') {
        schema.views += 1;
      } else {
        schema.tables += 1;
      }
    });

    return databases;
  }, [schemaInfo.tables]);

  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  return {
    schemaInfo,
    refetchSchema: fetchSchema,
    getSchemaAsText,
    getSimplifiedSchema,
  };
};
