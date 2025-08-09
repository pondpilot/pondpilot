/* eslint-disable max-classes-per-file */

export interface ErrorDetails {
  query?: string;
  connectionId?: string;
  retryable?: boolean;
  originalError?: unknown;
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

  const errorStr = error instanceof Error ? error.message : String(error);

  // Parse common DuckDB error patterns
  if (errorStr.includes('Catalog Error')) {
    return new DatabaseEngineError(errorStr, 'CATALOG_ERROR', undefined, false);
  }

  if (errorStr.includes('Parser Error')) {
    return new QueryExecutionError(errorStr);
  }

  if (errorStr.includes('Binder Error')) {
    return new QueryExecutionError(errorStr);
  }

  if (errorStr.includes('IO Error')) {
    return new FileOperationError(errorStr);
  }

  if (errorStr.includes('Out of Memory')) {
    return new DatabaseEngineError(errorStr, 'OUT_OF_MEMORY', undefined, false);
  }

  // Default case
  return new DatabaseEngineError(errorStr, 'UNKNOWN_ERROR', { originalError: error }, false);
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
      } catch {
        // If parsing fails, treat as regular error
        return parseNativeError(errorObj);
      }
    }
  }

  return parseNativeError(error);
}
