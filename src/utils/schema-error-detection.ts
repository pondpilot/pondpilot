/**
 * Utility functions for detecting and handling schema mismatch errors
 */

/**
 * Checks if an error indicates a schema mismatch or view-related issue.
 *
 * WARNING: This function relies on fragile error message pattern matching.
 * DuckDB error messages may change between versions, and this detection
 * could break if the underlying error message formats are modified.
 * Consider this when upgrading DuckDB or if schema error detection
 * starts failing unexpectedly.
 *
 * @param error - The error object to check
 * @returns true if the error indicates a schema mismatch, false otherwise
 */
export function isSchemaError(error: Error): boolean {
  if (!error.message) {
    return false;
  }

  const errorMessage = error.message;

  // Check for various schema-related error patterns
  return (
    errorMessage.includes('Binder Error') ||
    errorMessage.includes('Invalid column') ||
    errorMessage.includes('Contents of view were altered')
  );
}

/**
 * Detects errors where the underlying table/view is missing.
 */
export function isMissingRelationError(error: Error): boolean {
  if (!error.message) {
    return false;
  }

  const msg = error.message.toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('table with name') ||
    msg.includes('not found') ||
    (msg.includes('catalog error') && msg.includes('does not exist'))
  );
}
