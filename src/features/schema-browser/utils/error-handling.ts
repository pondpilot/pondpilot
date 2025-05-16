/**
 * Error handling utilities for schema browser
 */

/**
 * Error types that can occur during schema operations
 */
export enum SchemaErrorType {
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  INVALID_SCHEMA = 'INVALID_SCHEMA',
  RESOURCE_LIMIT = 'RESOURCE_LIMIT',
  USER_CANCELLED = 'USER_CANCELLED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Schema error with categorized type and user-friendly message
 */
export class SchemaError extends Error {
  constructor(
    public type: SchemaErrorType,
    public userMessage: string,
    public originalError?: Error,
    public context?: Record<string, any>,
  ) {
    super(userMessage);
    this.name = 'SchemaError';
  }
}

/**
 * Categorizes errors and provides user-friendly messages
 * @param error - The original error
 * @param context - Additional context about the operation
 * @returns Categorized schema error with user guidance
 */
export function categorizeError(error: unknown, context?: Record<string, any>): SchemaError {
  // Handle different error types
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();

    // Timeout errors
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('took too long') ||
      error.name === 'TimeoutError'
    ) {
      return new SchemaError(
        SchemaErrorType.TIMEOUT_ERROR,
        'The operation took too long to complete. This might happen with large schemas. Try selecting fewer items or contact support if the issue persists.',
        error,
        context,
      );
    }

    // Connection errors
    if (
      errorMessage.includes('connection') ||
      errorMessage.includes('network') ||
      errorMessage.includes('failed to fetch')
    ) {
      return new SchemaError(
        SchemaErrorType.CONNECTION_ERROR,
        'Unable to connect to the database. Please check your connection and try again.',
        error,
        context,
      );
    }

    // Permission errors
    if (
      errorMessage.includes('permission') ||
      errorMessage.includes('access denied') ||
      errorMessage.includes('unauthorized')
    ) {
      return new SchemaError(
        SchemaErrorType.PERMISSION_ERROR,
        'You do not have permission to access this schema. Please check your access rights.',
        error,
        context,
      );
    }

    // User cancellation
    if (errorMessage.includes('cancelled') || errorMessage.includes('abort')) {
      return new SchemaError(
        SchemaErrorType.USER_CANCELLED,
        'Operation cancelled. You can try again whenever you are ready.',
        error,
        context,
      );
    }

    // Resource limit errors
    if (
      errorMessage.includes('limit') ||
      errorMessage.includes('too many') ||
      errorMessage.includes('resource')
    ) {
      return new SchemaError(
        SchemaErrorType.RESOURCE_LIMIT,
        'Resource limit reached. Try working with a smaller schema or contact support for help.',
        error,
        context,
      );
    }

    // Invalid schema errors
    if (
      errorMessage.includes('invalid') ||
      errorMessage.includes('not found') ||
      errorMessage.includes('does not exist')
    ) {
      return new SchemaError(
        SchemaErrorType.INVALID_SCHEMA,
        'The selected schema or table could not be found. It may have been deleted or renamed.',
        error,
        context,
      );
    }
  }

  // Default unknown error
  return new SchemaError(
    SchemaErrorType.UNKNOWN_ERROR,
    'An unexpected error occurred. Please try again or contact support if the issue persists.',
    error instanceof Error ? error : new Error(String(error)),
    context,
  );
}

/**
 * Gets recovery suggestions based on error type
 * @param errorType - The type of error
 * @returns Array of recovery suggestions
 */
export function getRecoverySuggestions(errorType: SchemaErrorType): string[] {
  switch (errorType) {
    case SchemaErrorType.TIMEOUT_ERROR:
      return [
        'Try selecting fewer tables or columns',
        'Check if the database is under heavy load',
        'Contact your database administrator',
      ];

    case SchemaErrorType.CONNECTION_ERROR:
      return [
        'Check your internet connection',
        'Verify the database is running',
        'Check firewall settings',
        'Try reconnecting to the database',
      ];

    case SchemaErrorType.PERMISSION_ERROR:
      return [
        'Contact your database administrator',
        'Check your user permissions',
        'Try logging in with different credentials',
      ];

    case SchemaErrorType.RESOURCE_LIMIT:
      return [
        'Filter to show only essential tables',
        'Work with smaller schemas',
        'Contact support to increase limits',
      ];

    case SchemaErrorType.INVALID_SCHEMA:
      return [
        'Refresh the database explorer',
        'Check if the schema still exists',
        'Try selecting a different schema',
      ];

    case SchemaErrorType.USER_CANCELLED:
      return ['You can retry the operation at any time'];

    default:
      return [
        'Try refreshing the page',
        'Check the browser console for details',
        'Contact support if the issue persists',
      ];
  }
}

/**
 * Formats error for display with title, message, and suggestions
 * @param error - The schema error
 * @returns Formatted error object for UI display
 */
export function formatErrorForDisplay(error: SchemaError): {
  title: string;
  message: string;
  suggestions: string[];
  details?: string;
} {
  const title = getErrorTitle(error.type);
  const suggestions = getRecoverySuggestions(error.type);

  return {
    title,
    message: error.userMessage,
    suggestions,
    details: process.env.NODE_ENV === 'development' ? error.originalError?.stack : undefined,
  };
}

/**
 * Gets a user-friendly title for the error type
 * @param errorType - The type of error
 * @returns User-friendly error title
 */
function getErrorTitle(errorType: SchemaErrorType): string {
  switch (errorType) {
    case SchemaErrorType.CONNECTION_ERROR:
      return 'Connection Problem';
    case SchemaErrorType.TIMEOUT_ERROR:
      return 'Operation Timed Out';
    case SchemaErrorType.PERMISSION_ERROR:
      return 'Access Denied';
    case SchemaErrorType.INVALID_SCHEMA:
      return 'Schema Not Found';
    case SchemaErrorType.RESOURCE_LIMIT:
      return 'Resource Limit Reached';
    case SchemaErrorType.USER_CANCELLED:
      return 'Operation Cancelled';
    default:
      return 'Unexpected Error';
  }
}

/**
 * Logs error with appropriate context
 * @param error - The error to log
 * @param context - Additional context
 */
export function logSchemaError(error: SchemaError, context?: Record<string, any>): void {
  const logData = {
    errorType: error.type,
    message: error.message,
    userMessage: error.userMessage,
    context: { ...error.context, ...context },
    timestamp: new Date().toISOString(),
  };

  if (process.env.NODE_ENV === 'development') {
    console.error('Schema Error:', logData, error.originalError);
  } else {
    // In production, you might want to send this to an error tracking service
    console.error('Schema Error:', error.userMessage);
  }
}
