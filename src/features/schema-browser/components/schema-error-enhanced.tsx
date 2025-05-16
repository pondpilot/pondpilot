import { IconAlertTriangle, IconRefresh, IconInfoCircle } from '@tabler/icons-react';
import React from 'react';

import { SchemaError, formatErrorForDisplay } from '../utils/error-handling';

interface SchemaErrorEnhancedProps {
  error: SchemaError;
  onRetry?: () => void;
  className?: string;
}

/**
 * Enhanced error display component with categorized errors and recovery suggestions
 */
export const SchemaErrorEnhanced: React.FC<SchemaErrorEnhancedProps> = ({
  error,
  onRetry,
  className = '',
}) => {
  const { title, message, suggestions, details } = formatErrorForDisplay(error);

  return (
    <div
      className={`bg-background px-6 py-8 rounded-lg shadow-sm max-w-2xl mx-auto ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start space-x-4">
        <div className="flex-shrink-0">
          <IconAlertTriangle size={24} className="text-iconError" aria-hidden="true" />
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-semibold text-textPrimary mb-2">{title}</h3>

          <p className="text-textSecondary mb-4">{message}</p>

          {suggestions.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center space-x-2 mb-2">
                <IconInfoCircle size={16} className="text-iconInfo" />
                <h4 className="text-sm font-medium text-textPrimary">Suggestions:</h4>
              </div>
              <ul className="list-disc list-inside space-y-1">
                {suggestions.map((suggestion, index) => (
                  <li key={index} className="text-sm text-textSecondary">
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-brand text-white rounded-md hover:bg-brandHover transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
              aria-label="Retry the operation"
            >
              <IconRefresh size={16} />
              <span>Try Again</span>
            </button>
          )}

          {details && process.env.NODE_ENV === 'development' && (
            <details className="mt-4">
              <summary className="text-sm text-textTertiary cursor-pointer hover:text-textSecondary">
                Technical Details
              </summary>
              <pre className="mt-2 p-2 bg-backgroundSubtle rounded text-xs text-textTertiary overflow-x-auto">
                {details}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
};
