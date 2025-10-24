/**
 * Error Classification Utilities
 *
 * Centralized utilities for identifying and classifying different types
 * of errors that occur during database operations.
 */

/**
 * Check if an error is a CORS-related error
 *
 * This is intentionally conservative. It checks for explicit CORS messages
 * or specific file access errors over HTTP/S3 that behave like CORS issues.
 *
 * @param error - The error to check
 * @returns true if the error is CORS-related
 */
export function isCorsError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();

  // Explicit CORS errors
  const isExplicitCors = message.includes('cors') || message.includes('cross-origin');

  // DuckDB httpfs specific CORS/network errors
  const isFileAccessError =
    (message.includes('http') && message.includes('error code')) ||
    (message.includes('unable to connect') && message.includes('http')) ||
    (message.includes('opening file') &&
      message.includes('failed') &&
      (message.includes('http') || message.includes('s3://'))) ||
    (message.includes('cannot open file') &&
      (message.includes('http') || message.includes('s3://')));

  return isExplicitCors || isFileAccessError;
}

/**
 * Check if an error is a NotReadableError
 *
 * This error occurs when a file handle becomes invalid or unreadable,
 * typically requiring a file system sync to resolve.
 *
 * @param error - The error to check
 * @returns true if the error is a NotReadableError
 */
export function isNotReadableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  // Check both error.name (for DOMException) and message content
  return (
    error.name === 'NotReadableError' ||
    error.message.includes('NotReadableError') ||
    error.message.includes('not readable')
  );
}

/**
 * Check if an error is a network-related error
 *
 * Network errors can be transient and may benefit from retry logic.
 * This includes CORS errors as a subset.
 *
 * @param error - The error to check
 * @returns true if the error is network-related
 */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();

  // Any CORS error is also a network error, so we check that first.
  if (isCorsError(error)) {
    return true;
  }

  // Check for other common network-related error messages.
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('failed to fetch') ||
    message.includes('failed to load')
  );
}

/**
 * Extract a user-friendly error message from an unknown error
 *
 * @param error - The error to extract a message from
 * @returns A user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  // Handle cases where a plain object with a message property is thrown
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return String(error);
}
