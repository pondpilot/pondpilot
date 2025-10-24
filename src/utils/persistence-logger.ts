/**
 * Logging utilities for persistence operations.
 * In production, errors are silently handled to avoid console noise,
 * but critical errors should still be visible for debugging.
 */

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Logs a warning about a persistence operation.
 * Only logs in development mode.
 *
 * @param message - Warning message
 * @param data - Optional data to log
 */
export function logPersistenceWarning(message: string, data?: unknown): void {
  if (isDev) {
    console.warn(`[Persistence Warning] ${message}`, data);
  }
}

/**
 * Logs an error from a persistence operation.
 * Always logs errors since they indicate actual failures that need attention.
 *
 * @param message - Error message
 * @param error - The error object
 */
export function logPersistenceError(message: string, error: unknown): void {
  // Always log errors, even in production, as they indicate real issues
  // that might need debugging or could affect data integrity
  console.error(`[Persistence Error] ${message}`, error);
}

/**
 * Creates a standard catch handler for persistence operations.
 * Use this to ensure consistent error handling across all persistence calls.
 *
 * @param operation - Description of the operation (e.g., "persist new SQL script")
 * @returns Error handler function
 */
export function createPersistenceCatchHandler(operation: string) {
  return (error: unknown) => {
    logPersistenceError(`Failed to ${operation}`, error);
  };
}
