import { Button, Center, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Component, ErrorInfo, ReactNode } from 'react';

interface ChartErrorBoundaryProps {
  children: ReactNode;
  onSwitchToTable?: () => void;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ChartErrorBoundary extends Component<
  ChartErrorBoundaryProps,
  ChartErrorBoundaryState
> {
  constructor(props: ChartErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ChartErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Chart rendering error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  handleSwitchToTable = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onSwitchToTable?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Center className="h-full">
          <Stack align="center" gap="sm">
            <ThemeIcon variant="light" color="red" size="xl" radius="xl">
              <IconAlertTriangle size={24} />
            </ThemeIcon>
            <Text fw={500} size="sm">
              Chart rendering failed
            </Text>
            <Text c="dimmed" size="xs" maw={300} ta="center">
              {this.state.error?.message ||
                'An unexpected error occurred while rendering the chart.'}
            </Text>
            <Stack gap="xs" mt="xs">
              <Button size="xs" variant="outline" onClick={this.handleRetry}>
                Try Again
              </Button>
              {this.props.onSwitchToTable && (
                <Button size="xs" variant="outline" onClick={this.handleSwitchToTable}>
                  Switch to Table View
                </Button>
              )}
            </Stack>
          </Stack>
        </Center>
      );
    }

    return this.props.children;
  }
}
