import { Component, type ReactNode } from 'react';
import { Button, Container, Stack, Text, Title } from '@mantine/core';

interface Props {
  children: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    // Reload the page to fully reset state
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Container size="sm" mt="xl">
          <Stack gap="md">
            <Title order={2}>Something went wrong</Title>
            <Text c="dimmed">
              An unexpected error occurred. Please try refreshing the page.
            </Text>
            {this.state.error && (
              <Text size="sm" c="red" ff="monospace">
                {this.state.error.message}
              </Text>
            )}
            <Button onClick={this.handleReset}>Refresh Page</Button>
          </Stack>
        </Container>
      );
    }

    return this.props.children;
  }
}
