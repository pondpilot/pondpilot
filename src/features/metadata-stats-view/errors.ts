/* eslint-disable max-classes-per-file */
/**
 * Custom error types for metadata statistics feature
 * Provides specific error handling for different failure scenarios
 */

/**
 * Base error class for all metadata processing errors
 */
export abstract class MetadataError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    public readonly context?: Record<string, any>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Error thrown when data processing fails during metadata calculation
 */
export class MetadataProcessingError extends MetadataError {
  readonly code = 'METADATA_PROCESSING_ERROR';

  constructor(
    message: string,
    public readonly columnName?: string,
    context?: Record<string, any>,
  ) {
    super(message, context);
  }
}

/**
 * Error thrown when data validation fails
 */
export class MetadataValidationError extends MetadataError {
  readonly code = 'METADATA_VALIDATION_ERROR';

  constructor(
    message: string,
    public readonly validationRules?: string[],
    context?: Record<string, any>,
  ) {
    super(message, context);
  }
}

/**
 * Error thrown when chart rendering fails
 */
export class ChartRenderingError extends MetadataError {
  readonly code = 'CHART_RENDERING_ERROR';

  constructor(
    message: string,
    public readonly chartType?: string,
    context?: Record<string, any>,
  ) {
    super(message, context);
  }
}

/**
 * Error thrown when statistical calculations fail
 */
export class StatisticalCalculationError extends MetadataError {
  readonly code = 'STATISTICAL_CALCULATION_ERROR';

  constructor(
    message: string,
    public readonly operation?: string,
    context?: Record<string, any>,
  ) {
    super(message, context);
  }
}

/**
 * Error thrown when data adapter operations fail
 */
export class DataAdapterError extends MetadataError {
  readonly code = 'DATA_ADAPTER_ERROR';

  constructor(
    message: string,
    public readonly operation?: string,
    context?: Record<string, any>,
  ) {
    super(message, context);
  }
}

/**
 * Error thrown when async processing is aborted
 */
export class ProcessingAbortedError extends MetadataError {
  readonly code = 'PROCESSING_ABORTED_ERROR';

  constructor(message: string = 'Processing was aborted', context?: Record<string, any>) {
    super(message, context);
  }
}

/**
 * Creates a user-friendly error message from various error types
 * Hides technical details in production while preserving them in development
 */
export function createUserFriendlyErrorMessage(error: unknown): string {
  if (error instanceof MetadataError) {
    return error.message;
  }

  if (error instanceof Error) {
    // In development, show more details
    if (process.env.NODE_ENV === 'development') {
      return `${error.name}: ${error.message}`;
    }

    // In production, provide generic message
    return 'An error occurred while processing metadata. Please try again.';
  }

  return 'An unexpected error occurred. Please try again.';
}

/**
 * Type guard to check if an error is a specific metadata error type
 */
export function isMetadataError<T extends MetadataError>(
  error: unknown,
  ErrorClass: new (...args: any[]) => T,
): error is T {
  return error instanceof ErrorClass;
}

/**
 * Logs metadata errors with appropriate detail level based on environment
 */
export function logMetadataError(error: unknown, context?: string): void {
  const prefix = context ? `[${context}]` : '[MetadataStats]';

  if (error instanceof MetadataError) {
    console.error(`${prefix} ${error.code}:`, error.message, error.context);
  } else if (error instanceof Error) {
    console.error(`${prefix} Unexpected error:`, error.message, error.stack);
  } else {
    console.error(`${prefix} Unknown error:`, error);
  }
}
