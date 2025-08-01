import { getDuckDBFunctions } from '@controllers/db/duckdb-meta';
import { ConnectionPool } from '@engines/types';
import { DBFunctionsMetadata } from '@models/db';
import { setDuckDBFunctions } from '@store/app-store';

/**
 * Loads DuckDB functions and updates the app store with the results.
 *
 * This supports potential future scenarios where we need to dynamically
 * update tooltips after executing DDL SQL that defines custom functions.
 * By centralizing function metadata in app state now, we avoid more
 * complex refactoring later. This trade-off is intentional to ensure
 * better maintainability.
 *
 * @param conn - DuckDB connection pool
 * @returns The loaded DuckDB functions
 */
export async function loadDuckDBFunctions(conn: ConnectionPool): Promise<DBFunctionsMetadata[]> {
  try {
    // Get functions using the existing method
    const functions = await getDuckDBFunctions(conn);

    // Update the store with the new functions
    setDuckDBFunctions(functions);

    return functions;
  } catch (error) {
    console.error('Failed to load DuckDB functions:', error);
    // Return empty array in case of error
    return [];
  }
}
