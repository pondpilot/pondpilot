import { format } from 'sql-formatter';

/**
 * Format SQL and return result with success status
 * @param sql The SQL query to format
 * @returns Object with formatted SQL and success status
 */
export function formatSQLSafe(sql: string): { success: boolean; result: string; error?: string } {
  if (!sql || !sql.trim()) {
    return {
      success: false,
      result: sql,
      error: 'Empty SQL query',
    };
  }

  try {
    const formatted = format(sql, {
      language: 'duckdb',
      keywordCase: 'upper',
    });
    return {
      success: true,
      result: formatted,
    };
  } catch (error) {
    return {
      success: false,
      result: sql,
      error: error instanceof Error ? error.message : 'Failed to format SQL query',
    };
  }
}
