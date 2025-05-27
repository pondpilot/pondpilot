import { showError, showWarning } from '@components/app-notifications/app-notifications';
import type { NotificationData } from '@mantine/notifications';

import { AI_ASSISTANT_TIMINGS } from './constants';

interface ExtendedNotificationData extends NotificationData {
  action?: {
    label: string;
    onClick: () => void;
  };
}

function navigateToSettings(): void {
  //TODO: This is a placeholder - replace with router useNavigate
  const settingsEvent = new CustomEvent('navigate-to-settings');
  window.dispatchEvent(settingsEvent);
}

export interface DetailedError {
  type: 'network' | 'api' | 'auth' | 'parse' | 'config' | 'unknown';
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

    showError(notificationData);
  }
}

export function logError(context: string, error: unknown): void {
  console.error(`[AI Assistant] ${context}:`, error);
}

export function categorizeError(error: unknown): DetailedError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorLower = errorMessage.toLowerCase();

  // Network/CORS errors
  if (
    errorLower.includes('cors') ||
    errorLower.includes('failed to fetch') ||
    errorLower.includes('network request failed')
  ) {
    return {
      type: 'network',
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

  // Authentication errors
  if (
    errorLower.includes('unauthorized') ||
    errorLower.includes('invalid api key') ||
    errorLower.includes('authentication')
  ) {
    return {
      type: 'auth',
      message: errorMessage,
      userMessage: 'Invalid API key. Please check your API key configuration in Settings.',
      retryable: false,
      action: {
        label: 'Update API Key',
        callback: navigateToSettings,
      },
    };
  }

  // Rate limiting
  if (errorLower.includes('rate limit') || errorLower.includes('too many requests')) {
    return {
      type: 'api',
      message: errorMessage,
      userMessage: 'Rate limit exceeded. Please wait a moment before trying again.',
      retryable: true,
    };
  }

  // API quota/billing errors
  if (
    errorLower.includes('quota') ||
    errorLower.includes('billing') ||
    errorLower.includes('insufficient funds')
  ) {
    return {
      type: 'api',
      message: errorMessage,
      userMessage:
        'API quota exceeded or billing issue. Please check your account with the AI provider.',
      retryable: false,
      action: {
        label: 'Check Account',
        callback: () => {
          // Open provider billing page - this could be made more specific per provider
          window.open('https://platform.openai.com/account/billing', '_blank');
        },
      },
    };
  }

  // Configuration errors
  if (
    errorLower.includes('api key not configured') ||
    errorLower.includes('unsupported ai provider')
  ) {
    return {
      type: 'config',
      message: errorMessage,
      userMessage:
        'AI Assistant not configured. Please set up your API key and provider in Settings.',
      retryable: false,
      action: {
        label: 'Go to Settings',
        callback: navigateToSettings,
      },
    };
  }

  // Parse errors
  if (
    errorLower.includes('parse') ||
    errorLower.includes('json') ||
    errorLower.includes('malformed')
  ) {
    return {
      type: 'parse',
      message: errorMessage,
      userMessage: 'Received invalid response from AI provider. Please try again.',
      retryable: true,
    };
  }

  // Generic API errors
  if (errorLower.includes('api error')) {
    return {
      type: 'api',
      message: errorMessage,
      userMessage: 'AI service error. Please try again or contact support if the issue persists.',
      retryable: true,
    };
  }

  // Unknown errors
  return {
    type: 'unknown',
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
