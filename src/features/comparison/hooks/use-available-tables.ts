import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { useEffect, useState } from 'react';

export interface TableInfo {
  database: string;
  schema: string;
  name: string;
  fullName: string;
  type: 'table' | 'view';
}

export const useAvailableTables = (pool: AsyncDuckDBConnectionPool) => {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTables = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const dbModel = await getDatabaseModel(pool);
        const tableList: TableInfo[] = [];

        dbModel.forEach((database) => {
          database.schemas.forEach((schema) => {
            schema.objects.forEach((object) => {
              tableList.push({
                database: database.name,
                schema: schema.name,
                name: object.name,
                fullName: `${database.name}.${schema.name}.${object.name}`,
                type: object.type,
              });
            });
          });
        });

        setTables(tableList);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        console.error('Failed to load tables:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadTables();
  }, [pool]);

  return { tables, isLoading, error };
};
