import {
  showError,
  showWarning,
  showErrorWithAction,
} from '@components/app-notifications/app-notifications';
import type { NotificationData } from '@mantine/notifications';

import { AI_ASSISTANT_TIMINGS } from './constants';

interface ExtendedNotificationData extends NotificationData {
  action?: {
    label: string;
    onClick: () => void;
  };
}

function navigateToSettings(): void {
  // Dispatch custom event to navigate to settings without page reload
  const event = new CustomEvent('navigate-to-route', { detail: { route: '/settings' } });
  window.dispatchEvent(event);
}

export enum ErrorCode {
  // Network errors
  NETWORK_CORS = 'NETWORK_CORS',
  NETWORK_OFFLINE = 'NETWORK_OFFLINE',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  NETWORK_GENERAL = 'NETWORK_GENERAL',

  // Authentication errors
  AUTH_INVALID_KEY = 'AUTH_INVALID_KEY',
  AUTH_EXPIRED_KEY = 'AUTH_EXPIRED_KEY',
  AUTH_MISSING_KEY = 'AUTH_MISSING_KEY',

  // API errors
  API_RATE_LIMIT = 'API_RATE_LIMIT',
  API_QUOTA_EXCEEDED = 'API_QUOTA_EXCEEDED',
  API_BILLING_ISSUE = 'API_BILLING_ISSUE',
  API_MODEL_NOT_FOUND = 'API_MODEL_NOT_FOUND',
  API_CONTEXT_LENGTH = 'API_CONTEXT_LENGTH',
  API_GENERAL = 'API_GENERAL',

  // Configuration errors
  CONFIG_NO_PROVIDER = 'CONFIG_NO_PROVIDER',
  CONFIG_INVALID_PROVIDER = 'CONFIG_INVALID_PROVIDER',
  CONFIG_MISSING_KEY = 'CONFIG_MISSING_KEY',

  // Parse errors
  PARSE_JSON = 'PARSE_JSON',
  PARSE_RESPONSE = 'PARSE_RESPONSE',

  // Unknown
  UNKNOWN = 'UNKNOWN',
}

export interface DetailedError {
  type: 'network' | 'api' | 'auth' | 'parse' | 'config' | 'unknown';
  code: ErrorCode;
  message: string;
  userMessage: string;
  retryable: boolean;
  action?: {
    label: string;
    callback: () => void;
  };
}

export interface ErrorDisplayOptions {
  element: HTMLTextAreaElement;
  originalValue?: string;
  duration?: number;
  showToast?: boolean;
  onRetry?: () => void;
}

export function displayError(error: unknown, options: ErrorDisplayOptions): void {
  const { showToast = true, onRetry } = options;

  const categorizedError = categorizeError(error);

  // Only show toast notification, don't update the textarea
  if (showToast) {
    const notificationData: ExtendedNotificationData = {
      title: 'AI Assistant Error',
      message: categorizedError.userMessage,
      autoClose: categorizedError.retryable
        ? false
        : AI_ASSISTANT_TIMINGS.ERROR_NOTIFICATION_DURATION,
    };

    // Add action button if available
    if (categorizedError.action) {
      notificationData.action = {
        label: categorizedError.action.label,
        onClick: categorizedError.action.callback,
      };
    }

    // Add retry indication for retryable errors
    if (categorizedError.retryable && onRetry) {
      notificationData.message = `${categorizedError.userMessage} You can try again.`;
      notificationData.autoClose = 5000; // Auto-close retryable errors after 5 seconds
      notificationData.action = {
        label: 'Retry',
        onClick: onRetry,
      };
    } else if (categorizedError.retryable) {
      notificationData.message = `${categorizedError.userMessage} Please try again.`;
      notificationData.autoClose = 4000;
    }

    // Use showErrorWithAction if there's an action, otherwise use showError
    if (notificationData.action) {
      showErrorWithAction(notificationData);
    } else {
      showError(notificationData);
    }
  }
}

export function logError(
  context: string,
  error: unknown,
  severity: 'error' | 'warn' = 'error',
): void {
  const prefix = `[AI Assistant] ${context}:`;
  if (severity === 'warn') {
    console.warn(prefix, error);
  } else {
    console.error(prefix, error);
  }
}

export function handleNonCriticalError(context: string, error: unknown): void {
  // For errors that don't affect user experience but should be logged
  logError(context, error, 'warn');
}

export function handleCriticalError(
  context: string,
  error: unknown,
  options?: { showToast?: boolean; onRetry?: () => void },
): void {
  // For errors that affect user experience
  logError(context, error);

  if (options?.showToast) {
    const categorizedError = categorizeError(error);
    const notificationData: ExtendedNotificationData = {
      title: 'AI Assistant Error',
      message: categorizedError.userMessage,
      autoClose: categorizedError.retryable
        ? 5000
        : AI_ASSISTANT_TIMINGS.ERROR_NOTIFICATION_DURATION,
    };

    // Add action if available
    if (categorizedError.action) {
      notificationData.action = {
        label: categorizedError.action.label,
        onClick: categorizedError.action.callback,
      };
    }

    // Use showErrorWithAction if there's an action, otherwise use showError
    if (notificationData.action) {
      showErrorWithAction(notificationData);
    } else {
      showError(notificationData);
    }
  }
}

export function categorizeError(error: unknown): DetailedError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorLower = errorMessage.toLowerCase();

  // Network/CORS errors
  if (errorLower.includes('cors')) {
    return {
      type: 'network',
      code: ErrorCode.NETWORK_CORS,
      message: errorMessage,
      userMessage:
        'Browser security restrictions prevent direct API calls. Consider using a proxy server or alternative provider.',
      retryable: false,
      action: {
        label: 'Open Settings',
        callback: navigateToSettings,
      },
    };
  }

  if (errorLower.includes('failed to fetch') || errorLower.includes('network request failed')) {
    return {
      type: 'network',
      code: ErrorCode.NETWORK_GENERAL,
      message: errorMessage,
      userMessage: 'Network request failed. Please check your internet connection.',
      retryable: true,
    };
  }

  if (errorLower.includes('timeout')) {
    return {
      type: 'network',
      code: ErrorCode.NETWORK_TIMEOUT,
      message: errorMessage,
      userMessage: 'Request timed out. Please try again.',
      retryable: true,
    };
  }

  // Authentication errors
  if (errorLower.includes('invalid api key') || errorLower.includes('incorrect api key')) {
    return {
      type: 'auth',
      code: ErrorCode.AUTH_INVALID_KEY,
      message: errorMessage,
      userMessage: 'Invalid API key. Please check your API key configuration in Settings.',
      retryable: false,
      action: {
        label: 'Update API Key',
        callback: navigateToSettings,
      },
    };
  }

  if (errorLower.includes('expired') && errorLower.includes('key')) {
    return {
      type: 'auth',
      code: ErrorCode.AUTH_EXPIRED_KEY,
      message: errorMessage,
      userMessage: 'API key has expired. Please update your API key in Settings.',
      retryable: false,
      action: {
        label: 'Update API Key',
        callback: navigateToSettings,
      },
    };
  }

  if (errorLower.includes('unauthorized') || errorLower.includes('authentication')) {
    return {
      type: 'auth',
      code: ErrorCode.AUTH_MISSING_KEY,
      message: errorMessage,
      userMessage: 'Authentication failed. Please check your API key configuration.',
      retryable: false,
      action: {
        label: 'Go to Settings',
        callback: navigateToSettings,
      },
    };
  }

  // Rate limiting
  if (errorLower.includes('rate limit') || errorLower.includes('too many requests')) {
    return {
      type: 'api',
      code: ErrorCode.API_RATE_LIMIT,
      message: errorMessage,
      userMessage: 'Rate limit exceeded. Please wait a moment before trying again.',
      retryable: true,
    };
  }

  // API quota/billing errors
  if (errorLower.includes('quota')) {
    return {
      type: 'api',
      code: ErrorCode.API_QUOTA_EXCEEDED,
      message: errorMessage,
      userMessage: 'API quota exceeded. Please check your account limits with your AI provider.',
      retryable: false,
    };
  }

  if (errorLower.includes('billing') || errorLower.includes('insufficient funds')) {
    return {
      type: 'api',
      code: ErrorCode.API_BILLING_ISSUE,
      message: errorMessage,
      userMessage:
        'Billing issue detected. Please check your payment method with your AI provider.',
      retryable: false,
    };
  }

  // Model and context errors
  if (
    errorLower.includes('model') &&
    (errorLower.includes('not found') || errorLower.includes('does not exist'))
  ) {
    return {
      type: 'api',
      code: ErrorCode.API_MODEL_NOT_FOUND,
      message: errorMessage,
      userMessage: 'The selected AI model is not available. Please check your model settings.',
      retryable: false,
      action: {
        label: 'Check Settings',
        callback: navigateToSettings,
      },
    };
  }

  if (errorLower.includes('context length') || errorLower.includes('token limit')) {
    return {
      type: 'api',
      code: ErrorCode.API_CONTEXT_LENGTH,
      message: errorMessage,
      userMessage: 'Request too long. Please reduce the amount of text or context.',
      retryable: true,
    };
  }

  // Configuration errors
  if (errorLower.includes('api key not configured')) {
    return {
      type: 'config',
      code: ErrorCode.CONFIG_MISSING_KEY,
      message: errorMessage,
      userMessage: 'API key not configured. Please add your API key in Settings.',
      retryable: false,
      action: {
        label: 'Go to Settings',
        callback: navigateToSettings,
      },
    };
  }

  if (errorLower.includes('unsupported ai provider')) {
    return {
      type: 'config',
      code: ErrorCode.CONFIG_INVALID_PROVIDER,
      message: errorMessage,
      userMessage: 'Unsupported AI provider. Please select a valid provider in Settings.',
      retryable: false,
      action: {
        label: 'Go to Settings',
        callback: navigateToSettings,
      },
    };
  }

  // Parse errors
  if (
    errorLower.includes('json') ||
    (errorLower.includes('parse') && errorLower.includes('json'))
  ) {
    return {
      type: 'parse',
      code: ErrorCode.PARSE_JSON,
      message: errorMessage,
      userMessage: 'Failed to parse AI response. Please try again.',
      retryable: true,
    };
  }

  if (errorLower.includes('parse') || errorLower.includes('malformed')) {
    return {
      type: 'parse',
      code: ErrorCode.PARSE_RESPONSE,
      message: errorMessage,
      userMessage: 'Received invalid response from AI provider. Please try again.',
      retryable: true,
    };
  }

  // Generic API errors
  if (errorLower.includes('api error')) {
    return {
      type: 'api',
      code: ErrorCode.API_GENERAL,
      message: errorMessage,
      userMessage: 'AI service error. Please try again or contact support if the issue persists.',
      retryable: true,
    };
  }

  // Unknown errors
  return {
    type: 'unknown',
    code: ErrorCode.UNKNOWN,
    message: errorMessage,
    userMessage: 'An unexpected error occurred. Please try again.',
    retryable: true,
  };
}

export function handleAIServiceError(
  error: unknown,
  textarea: HTMLTextAreaElement,
  originalQuery: string,
): void {
  logError('AI service request failed', error);

  displayError(error, {
    element: textarea,
    originalValue: originalQuery,
  });
}

export function handleSchemaContextError(error: unknown): void {
  logError('Schema context generation failed', error);

  const categorizedError = categorizeError(error);

  // Only show user notification for severe errors that might affect the user experience
  if (categorizedError.type === 'auth' || categorizedError.type === 'config') {
    showWarning({
      title: 'Database Schema Warning',
      message: 'Could not load database schema context. AI responses may be less accurate.',
      autoClose: AI_ASSISTANT_TIMINGS.ERROR_NOTIFICATION_DURATION,
    });
  }
}
