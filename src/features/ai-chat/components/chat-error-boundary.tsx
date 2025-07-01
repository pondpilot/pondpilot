import { Paper, Text, Button, Stack, Code } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { ReactNode, useCallback, useState } from 'react';
import { ErrorBoundary, FallbackProps } from 'react-error-boundary';

interface ChatErrorFallbackProps extends FallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

function ChatErrorFallback({ error, resetErrorBoundary }: ChatErrorFallbackProps) {
  return (
    <Paper p="md" radius="md" withBorder className="bg-red-50 dark:bg-red-950/20">
      <Stack gap="sm">
        <div className="flex items-center gap-2">
          <IconAlertTriangle size={20} className="text-red-600 dark:text-red-400" />
          <Text size="sm" fw={500} c="red">
            Something went wrong in the chat
          </Text>
        </div>

        <Text size="xs" c="dimmed">
          The chat encountered an error. You can try refreshing the conversation or starting a new
          one.
        </Text>

        {process.env.NODE_ENV === 'development' && (
          <Code block className="text-xs">
            {error.message}
            {error.stack && (
              <>
                {'\n\n'}
                {error.stack}
              </>
            )}
          </Code>
        )}

        <Button size="xs" variant="subtle" onClick={resetErrorBoundary}>
          Try again
        </Button>
      </Stack>
    </Paper>
  );
}

interface ChatErrorBoundaryProps {
  children: ReactNode;
  fallback?: (props: FallbackProps) => ReactNode;
}

export function ChatErrorBoundary({ children, fallback }: ChatErrorBoundaryProps) {
  return (
    <ErrorBoundary
      FallbackComponent={fallback || ChatErrorFallback}
      onError={(error, errorInfo) => {
        // Log errors only in development
        if (process.env.NODE_ENV === 'development') {
          console.error('Chat error boundary caught an error:', error, errorInfo);
        }
      }}
      onReset={() => {
        // You can add additional reset logic here if needed
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

// Utility hook to throw async errors to the error boundary
export function useAsyncError() {
  const [, setError] = useState();

  return useCallback(
    (error: Error) => {
      setError(() => {
        throw error;
      });
    },
    [setError],
  );
}
