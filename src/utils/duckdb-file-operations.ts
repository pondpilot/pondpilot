/**
 * Utilities for DuckDB file operations and error handling
 */

// Constants for file operations
export const FILE_DROP_MAX_RETRIES = 10;
export const FILE_DROP_INITIAL_DELAY_MS = 100;
export const FILE_DROP_MAX_DELAY_MS = 3000;
export const FILE_DROP_QUICK_RETRY_THRESHOLD = 7;
export const FILE_DROP_BACKOFF_FACTOR = 1.5;
export const CONNECTION_IDLE_TIMEOUT_MS = 5000;
export const CONNECTION_RECREATION_TIMEOUT_MS = 10000;
export const CLEANUP_OPERATION_TIMEOUT_MS = 3000;
export const CONNECTION_IDLE_POLL_INTERVAL_MS = 50;
export const FILE_HANDLE_RELEASE_DELAY_MS = 100;

/**
 * Check if an error is a query cancellation error
 */
export function isQueryCancelledError(error: unknown): boolean {
  return error instanceof Error && error.message?.includes('query was canceled');
}

/**
 * Drop a file with retry logic
 * @param db The DuckDB bindings
 * @param fileName The name of the file to drop
 * @param fileType The type of file (for logging purposes)
 * @returns Promise that resolves when file is dropped or all retries are exhausted
 */
export async function dropFileWithRetry(
  db: { dropFile: (fileName: string) => Promise<void | null> },
  fileName: string,
  fileType: string = 'File',
): Promise<void> {
  let retries = FILE_DROP_MAX_RETRIES;
  let lastError: unknown;
  let delay = FILE_DROP_INITIAL_DELAY_MS;

  while (retries > 0) {
    try {
      await db.dropFile(fileName);
      return; // Success, exit
    } catch (error) {
      lastError = error;
      retries -= 1;

      if (retries > 0 && error instanceof Error && error.message.includes('file is in use')) {
        // For the first few retries, use shorter delays
        // For later retries, use longer delays with exponential backoff
        if (retries > FILE_DROP_QUICK_RETRY_THRESHOLD) {
          // Quick retries first
          delay = FILE_DROP_INITIAL_DELAY_MS;
        } else {
          // Exponential backoff for later retries
          delay = Math.min(delay * FILE_DROP_BACKOFF_FACTOR, FILE_DROP_MAX_DELAY_MS);
        }

        console.warn(
          `${fileType} ${fileName} is still in use, retrying in ${delay}ms... (${retries} retries left)`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // No more retries or different error
        break;
      }
    }
  }

  // If we get here, all retries failed
  console.error(`Failed to drop ${fileType} ${fileName} after retries:`, lastError);
  // Don't throw the error - let the operation continue
  // The file handle will eventually be released when the browser tab is closed
}

/**
 * Add a timeout to a promise
 * @param promise The promise to wrap
 * @param timeoutMs The timeout in milliseconds
 * @param operation The operation name (for error messages)
 * @returns The wrapped promise that will reject on timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string = 'Operation',
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}
