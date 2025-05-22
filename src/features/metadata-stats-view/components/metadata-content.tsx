import React from 'react';

import { ColumnOverviewPanel } from './column-overview-panel';
import { ColumnStatsPanel } from './column-stats-panel';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { LoadingState } from './loading-state';
import { TableMetadata } from '../model';

interface MetadataContentProps {
  loading: boolean;
  error: Error | null;
  metadata: TableMetadata | null;
  progress?: { current: number; total: number } | null;
  onRetry?: () => void;
}

export const MetadataContent = React.memo(
  ({ loading, error, metadata, progress, onRetry }: MetadataContentProps) => {
    if (loading) {
      return <LoadingState progress={progress} />;
    }

    if (error) {
      return <ErrorState error={error} onRetry={onRetry} />;
    }

    if (!metadata) {
      return (
        <EmptyState
          title="No data available"
          description="Open a table or run a query to view metadata statistics"
        />
      );
    }

    if (!metadata.columns || metadata.columns.length === 0) {
      return (
        <EmptyState
          title="No columns found"
          description="The current dataset does not contain any columns to analyze"
        />
      );
    }

    return (
      <div className="flex h-[calc(100%-45px)]">
        <ColumnOverviewPanel metadata={metadata} />
        <div className="w-px bg-borderLight-light dark:bg-borderLight-dark" />
        <ColumnStatsPanel metadata={metadata} />
      </div>
    );
  },
);

MetadataContent.displayName = 'MetadataContent';
