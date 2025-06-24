import { Alert, Button } from '@mantine/core';
import { Component, ReactNode, ErrorInfo } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

export class DataExplorerErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Data Explorer error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      return (
        <Alert variant="light" color="text-error" title="Data Explorer Error" className="m-4">
          <p>Something went wrong while loading the data explorer.</p>
          <Button
            variant="subtle"
            color="text-error"
            size="xs"
            onClick={this.handleReset}
            className="mt-2"
          >
            Try Again
          </Button>
        </Alert>
      );
    }

    return this.props.children;
  }
}
