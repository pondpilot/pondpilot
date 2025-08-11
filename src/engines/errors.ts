/* eslint-disable max-classes-per-file */

export interface ErrorDetails {
  query?: string;
  connectionId?: string;
  retryable?: boolean;
  originalError?: unknown;
  originalStack?: string;
}

export class DatabaseEngineError extends Error {
  public readonly code: string;
  public readonly details?: ErrorDetails;
  public readonly recoverable: boolean;

  constructor(message: string, code: string, details?: ErrorDetails, recoverable: boolean = false) {
    super(message);
    this.name = 'DatabaseEngineError';
    this.code = code;
    this.details = details;
    this.recoverable = recoverable;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DatabaseEngineError);
    }

    // If we have an original error, append its stack trace to ours
    if (details?.originalError instanceof Error && details.originalError.stack) {
      this.stack = `${this.stack}\nCaused by:\n${details.originalError.stack}`;
    } else if (details?.originalStack) {
      this.stack = `${this.stack}\nCaused by:\n${details.originalStack}`;
    }
  }
}

export class ConnectionPoolError extends DatabaseEngineError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 'CONNECTION_POOL_ERROR', details, true);
    this.name = 'ConnectionPoolError';
  }
}

export class QueryExecutionError extends DatabaseEngineError {
  constructor(message: string, query?: string, details?: ErrorDetails) {
    super(message, 'QUERY_EXECUTION_ERROR', { ...details, query }, false);
    this.name = 'QueryExecutionError';
  }
}

export class FileOperationError extends DatabaseEngineError {
  constructor(message: string, fileName?: string, details?: ErrorDetails) {
    super(message, 'FILE_OPERATION_ERROR', { ...details, query: fileName }, false);
    this.name = 'FileOperationError';
  }
}

export class InitializationError extends DatabaseEngineError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 'INITIALIZATION_ERROR', details, false);
    this.name = 'InitializationError';
  }
}

export class ConnectionAcquisitionError extends ConnectionPoolError {
  constructor(message: string, details?: ErrorDetails) {
    super(`Failed to acquire connection: ${message}`, details);
    this.name = 'ConnectionAcquisitionError';
  }
}

export class ConnectionTimeoutError extends ConnectionPoolError {
  constructor(timeout: number, details?: ErrorDetails) {
    super(`Connection acquisition timed out after ${timeout}ms`, details);
    this.name = 'ConnectionTimeoutError';
  }
}

export class PoolExhaustedError extends ConnectionPoolError {
  constructor(maxSize: number, details?: ErrorDetails) {
    super(`Connection pool exhausted (max size: ${maxSize})`, details);
    this.name = 'PoolExhaustedError';
  }
}

// Error type guards
export function isDatabaseEngineError(error: unknown): error is DatabaseEngineError {
  return error instanceof DatabaseEngineError;
}

export function isConnectionPoolError(error: unknown): error is ConnectionPoolError {
  return error instanceof ConnectionPoolError;
}

export function isRecoverableError(error: unknown): boolean {
  return isDatabaseEngineError(error) && error.recoverable;
}

// Error factory functions
export function wrapError(error: unknown, code: string, message?: string): DatabaseEngineError {
  if (isDatabaseEngineError(error)) {
    return error;
  }

  const errorMessage = message || (error instanceof Error ? error.message : String(error));
  return new DatabaseEngineError(errorMessage, code, { originalError: error }, false);
}

export function parseNativeError(error: unknown): DatabaseEngineError {
  if (isDatabaseEngineError(error)) {
    return error;
  }

  // Preserve the original error object and stack trace for better debugging
  const errorStr = error instanceof Error ? error.message : String(error);
  const originalError = error;
  const originalStack = error instanceof Error ? error.stack : undefined;

  // Parse common DuckDB error patterns
  if (errorStr.includes('Catalog Error')) {
    return new DatabaseEngineError(
      errorStr,
      'CATALOG_ERROR',
      { originalError, originalStack },
      false,
    );
  }

  if (errorStr.includes('Parser Error')) {
    return new QueryExecutionError(errorStr, undefined, { originalError, originalStack });
  }

  if (errorStr.includes('Binder Error')) {
    return new QueryExecutionError(errorStr, undefined, { originalError, originalStack });
  }

  if (errorStr.includes('IO Error')) {
    return new FileOperationError(errorStr, undefined, { originalError, originalStack });
  }

  if (errorStr.includes('Out of Memory')) {
    return new DatabaseEngineError(
      errorStr,
      'OUT_OF_MEMORY',
      { originalError, originalStack },
      false,
    );
  }

  // Default case
  return new DatabaseEngineError(
    errorStr,
    'UNKNOWN_ERROR',
    { originalError, originalStack },
    false,
  );
}

// Tauri error response type
export interface TauriErrorResponse {
  type: string;
  details?: {
    message?: string;
    sql?: string;
    path?: string;
  };
}

export function parseTauriError(error: unknown): DatabaseEngineError {
  if (isDatabaseEngineError(error)) {
    return error;
  }

  // Handle Tauri invoke errors
  if (error && typeof error === 'object' && 'message' in error) {
    const errorObj = error as any;

    // Try to parse as JSON if it's a string
    if (typeof errorObj.message === 'string') {
      // First, attempt JSON parsing for structured errors from Rust backend
      try {
        const parsed: TauriErrorResponse = JSON.parse(errorObj.message);

        switch (parsed.type) {
          case 'ConnectionError':
            return new ConnectionPoolError(parsed.details?.message || 'Connection error', {
              query: parsed.details?.sql,
              originalError: error,
            });

          case 'QueryError':
            return new QueryExecutionError(
              parsed.details?.message || 'Query error',
              parsed.details?.sql,
              { originalError: error },
            );

          case 'FileNotFound':
            return new FileOperationError(
              parsed.details?.message || `File not found: ${parsed.details?.path}`,
              parsed.details?.path,
              { originalError: error },
            );

          case 'PoolExhausted':
            return new PoolExhaustedError(0, { originalError: error });

          case 'InitializationError':
            return new InitializationError(parsed.details?.message || 'Initialization error', {
              originalError: error,
            });

          default:
            return new DatabaseEngineError(
              parsed.details?.message || 'Unknown error',
              parsed.type,
              { originalError: error },
              false,
            );
        }
      } catch (parseError) {
        // JSON parsing failed - handle as plain string error
        // This is expected for non-JSON error messages from the backend
        const errorMessage = errorObj.message;

        // Try to classify the error based on common patterns in the error message
        if (errorMessage.includes('ConnectionError') || errorMessage.includes('connection')) {
          return new ConnectionPoolError(errorMessage, { originalError: error });
        }

        if (
          errorMessage.includes('QueryError') ||
          errorMessage.includes('SQL') ||
          errorMessage.includes('syntax')
        ) {
          return new QueryExecutionError(errorMessage, undefined, { originalError: error });
        }

        if (
          errorMessage.includes('FileNotFound') ||
          errorMessage.includes('file not found') ||
          errorMessage.includes('No such file')
        ) {
          return new FileOperationError(errorMessage, undefined, { originalError: error });
        }

        if (errorMessage.includes('PoolExhausted') || errorMessage.includes('pool exhausted')) {
          return new PoolExhaustedError(0, { originalError: error });
        }

        if (
          errorMessage.includes('InitializationError') ||
          errorMessage.includes('initialization')
        ) {
          return new InitializationError(errorMessage, { originalError: error });
        }

        // If no patterns match, parse as a native error - pass the whole error object
        return parseNativeError(error);
      }
    }

    // If message is not a string, try to extract meaningful information
    if (errorObj.message !== undefined && errorObj.message !== null) {
      return parseNativeError(String(errorObj.message));
    }
  }

  return parseNativeError(error);
}
