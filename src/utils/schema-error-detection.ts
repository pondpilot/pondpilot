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
    errorMessage.includes('does not exist') ||
    errorMessage.includes('Invalid column') ||
    errorMessage.includes('Contents of view were altered')
  );
}

/**
 * Checks whether a schema error is likely caused by a flat-file schema drift
 * that can be fixed by re-syncing files and recreating managed views.
 *
 * Missing tables/views are intentionally excluded because re-running file sync
 * does not help for deleted database objects and can cause repeated retries.
 *
 * @param error - The error object to check
 * @returns true if auto-recovery is worth attempting, false otherwise
 */
export function isRecoverableSchemaError(error: Error): boolean {
  if (!error.message) {
    return false;
  }

  const errorMessage = error.message;

  return (
    errorMessage.includes('Binder Error') ||
    errorMessage.includes('Invalid column') ||
    errorMessage.includes('Contents of view were altered')
  );
}
