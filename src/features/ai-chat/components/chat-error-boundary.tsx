import { Paper, Text, Button, Stack, Code } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, resetError: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ChatErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Chat error boundary caught an error:', error, errorInfo);
  }

  private resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError);
      }

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
              The chat encountered an error. You can try refreshing the conversation or
              starting a new one.
            </Text>

            {process.env.NODE_ENV === 'development' && (
              <Code block className="text-xs">
                {this.state.error.message}
              </Code>
            )}

            <Button
              size="xs"
              variant="subtle"
              onClick={this.resetError}
            >
              Try again
            </Button>
          </Stack>
        </Paper>
      );
    }

    return this.props.children;
  }
}
