import { normalizeErrorMessage } from './error-utils';

/**
 * Error Classification Utilities
 *
 * Centralized utilities for identifying and classifying different types
 * of errors that occur during database operations.
 */

/**
 * Check if an error is a CORS-related error
 *
 * This is intentionally conservative to avoid retrying non-CORS errors.
 * We only retry when we're confident it's a pre-execution CORS/network error.
 *
 * @param error - The error to check
 * @returns true if the error is CORS-related
 *
 * @example
 * try {
 *   await fetch('https://example.com/data');
 * } catch (error) {
 *   if (isCorsError(error)) {
 *     // Retry with CORS proxy
 *   }
 * }
 */
export function isCorsError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  // Specific CORS and network-related errors that occur BEFORE execution
  return (
    // Explicit CORS errors
    message.includes('cors') ||
    message.includes('cross-origin') ||
    // Network errors (pre-execution)
    message.includes('failed to fetch') ||
    message.includes('failed to load') ||
    message.includes('networkerror') ||
    message.includes('network error') ||
    // XMLHttpRequest errors (common with S3 and HTTPS URLs)
    message.includes('failed to execute') ||
    // DuckDB httpfs specific CORS/network errors
    (message.includes('http') && message.includes('error code')) ||
    (message.includes('unable to connect') && message.includes('http')) ||
    // File access errors related to remote resources (http/https/s3)
    (message.includes('opening file') &&
      message.includes('failed') &&
      (message.includes('http') || message.includes('s3://'))) ||
    (message.includes('cannot open file') &&
      (message.includes('http') || message.includes('s3://')))
  );
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
  return normalizeErrorMessage(error);
}
