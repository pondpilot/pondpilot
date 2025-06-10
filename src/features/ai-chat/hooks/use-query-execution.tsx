import { useDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { ChatMessageQuery } from '@models/ai-chat';
import { useCallback } from 'react';

import { MAX_RESULT_ROWS } from '../utils';

export const useQueryExecution = () => {
  const duckDbConnectionPool = useDuckDBConnectionPool();

  const executeQuery = useCallback(async (sql: string): Promise<ChatMessageQuery> => {
    const startTime = Date.now();

    if (!duckDbConnectionPool) {
      return {
        sql,
        successful: false,
        error: 'Database connection not available',
        executionTime: 0,
      };
    }

    try {
      const result = await duckDbConnectionPool.query(sql);
      const proto = result.toArray();

      // Convert to our format and limit rows
      const columns = result.schema.fields.map((field: any) => field.name);
      const rows = proto.slice(0, MAX_RESULT_ROWS).map((row: any) => {
        return columns.map((col: string) => row[col]);
      });

      const queryResults = {
        columns,
        rows,
        rowCount: rows.length,
        truncated: proto.length > MAX_RESULT_ROWS,
      };

      return {
        sql,
        successful: true,
        results: queryResults,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        sql,
        successful: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        executionTime: Date.now() - startTime,
      };
    }
  }, [duckDbConnectionPool]);

  return { executeQuery };
};
