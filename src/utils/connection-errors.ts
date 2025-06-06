/**
 * Connection Error Classes
 *
 * Custom error types for database connection management
 */

/* eslint-disable max-classes-per-file */

/**
 * Error thrown when a connection timeout occurs
 */
export class ConnectionTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionTimeoutError';
  }
}

/**
 * Error thrown when max retries are exceeded
 */
export class MaxRetriesExceededError extends Error {
  public attempts: number;
  public lastError: Error;

  constructor(attempts: number, lastError: Error) {
    super(`Maximum connection attempts (${attempts}) exceeded`);
    this.name = 'MaxRetriesExceededError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}
