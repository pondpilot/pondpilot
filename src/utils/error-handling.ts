import { showError, showErrorWithAction } from '@components/app-notifications/app-notifications';

export interface ErrorContext {
  operation?: string;
  details?: Record<string, any>;
  userAction?: string;
  recoveryAction?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Converts an unknown error to a user-friendly message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'An unexpected error occurred';
}

/**
 * Logs an error with context and optionally shows a user notification
 */
export function handleError(
  error: unknown,
  context: ErrorContext,
  options: { showNotification?: boolean; notificationTitle?: string } = {},
): void {
  const errorMessage = getErrorMessage(error);
  const { operation, details, userAction, recoveryAction } = context;
  const { showNotification = true, notificationTitle = 'Error' } = options;

  // Log detailed error information for debugging
  console.error(`[${operation || 'Unknown Operation'}] ${errorMessage}`, {
    error,
    operation,
    details,
    userAction,
    stack: error instanceof Error ? error.stack : undefined,
  });

  // Show user-friendly notification if requested
  if (showNotification) {
    const userMessage = userAction ? `Failed to ${userAction.toLowerCase()}` : errorMessage;

    if (recoveryAction) {
      showErrorWithAction({
        title: notificationTitle,
        message: userMessage,
        action: recoveryAction,
      });
    } else {
      showError({
        title: notificationTitle,
        message: userMessage,
      });
    }
  }
}

/**
 * Creates an error handler function with pre-configured context
 */
export function createErrorHandler(
  defaultContext: ErrorContext,
  defaultOptions?: { showNotification?: boolean; notificationTitle?: string },
) {
  return (error: unknown, additionalContext?: Partial<ErrorContext>) => {
    handleError(error, { ...defaultContext, ...additionalContext }, defaultOptions);
  };
}

/**
 * Wraps an async function to automatically handle errors
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context: ErrorContext,
  options?: { showNotification?: boolean; notificationTitle?: string },
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error, context, options);
      throw error;
    }
  }) as T;
}
