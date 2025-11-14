import { ComparisonSource } from '@models/comparison';

/**
 * Type guard to validate if an unknown object is a valid ComparisonSource.
 * Performs runtime validation to ensure type safety when parsing external data.
 *
 * @param obj - The object to validate
 * @returns True if the object is a valid ComparisonSource
 */
export function isValidComparisonSource(obj: unknown): obj is ComparisonSource {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const source = obj as Record<string, unknown>;

  // Validate 'table' type source
  if (source.type === 'table') {
    if (typeof source.tableName !== 'string' || source.tableName.length === 0) {
      return false;
    }
    // schemaName and databaseName are optional but must be strings if present
    if (source.schemaName !== undefined && typeof source.schemaName !== 'string') {
      return false;
    }
    if (source.databaseName !== undefined && typeof source.databaseName !== 'string') {
      return false;
    }
    return true;
  }

  // Validate 'query' type source
  if (source.type === 'query') {
    if (typeof source.sql !== 'string' || source.sql.length === 0) {
      return false;
    }
    if (typeof source.alias !== 'string' || source.alias.length === 0) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Safely parses and validates a JSON string as a ComparisonSource.
 * Returns null if parsing fails or validation fails.
 *
 * @param json - The JSON string to parse
 * @returns A valid ComparisonSource or null
 */
export function parseComparisonSource(json: string): ComparisonSource | null {
  try {
    const parsed = JSON.parse(json);
    return isValidComparisonSource(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
