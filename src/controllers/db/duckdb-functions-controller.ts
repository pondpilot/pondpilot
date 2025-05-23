import { getDuckDBFunctions } from '@controllers/db/duckdb-meta';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { DBFunctionsMetadata } from '@models/db';
import { setDuckDBFunctions } from '@store/app-store';

/**
 * Loads DuckDB functions and updates the app store with the results.
 *
 * @param conn - DuckDB connection pool
 * @returns The loaded DuckDB functions
 */
export async function loadDuckDBFunctions(
  conn: AsyncDuckDBConnectionPool,
): Promise<DBFunctionsMetadata[]> {
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

/**
 * Converts DuckDB functions to a format compatible with function tooltips.
 *
 * @param functions - The DuckDB function metadata
 * @returns An object mapping function names to their descriptions and syntax
 */
export function convertFunctionsToTooltips(
  functions: DBFunctionsMetadata[],
): Record<string, { syntax: string; description: string }> {
  return functions.reduce<Record<string, { syntax: string; description: string }>>((acc, func) => {
    const description =
      func.description || `${func.function_name}(${func.parameters}) -> ${func.return_type}`;

    const syntax = `${func.function_name}(${func.parameters})`;

    acc[func.function_name] = {
      syntax,
      description,
    };
    return acc;
  }, {});
}
