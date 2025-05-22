import { useHotkeys } from '@mantine/hooks';
import { DataAdapterApi } from '@models/data-adapter';
import { setDataTestId } from '@utils/test-id';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { MetadataContent, MetadataHeader } from './components';
import { useMetadataStats, useFullDatasetToggle } from './hooks';

interface MetadataStatsViewProps {
  opened: boolean;
  onClose: () => void;
  dataAdapter: DataAdapterApi;
  tabId?: string;
}

export function MetadataStatsView({ opened, onClose, dataAdapter, tabId }: MetadataStatsViewProps) {
  const { useFullDataset, toggleFullDataset } = useFullDatasetToggle();
  const { loading, error, metadata, progress, fetchMetadata } = useMetadataStats(
    dataAdapter,
    tabId,
    useFullDataset,
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [height, setHeight] = useState(40); // Height as percentage
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasTriggeredFetch = useRef<string | false>(false);

  // Handle Escape key to close panel when focused
  useHotkeys([['Escape', () => opened && onClose()]]);

  // Toggle between expanded and collapsed view
  const toggleExpanded = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    setHeight(newExpanded ? 85 : 40);
  };

  // Handle resize logic
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const parentHeight = rect.height / (height / 100); // Calculate parent height
      const newHeight = Math.max(
        20,
        Math.min(90, ((parentHeight - e.clientY) / parentHeight) * 100),
      );
      setHeight(newHeight);
      setIsExpanded(newHeight > 60); // Auto-toggle expanded state based on height
    },
    [isResizing, height],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add mouse move/up listeners when resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Fetch metadata when opened and we have schema
  const schemaLength = dataAdapter.currentSchema.length;
  const { dataSourceVersion } = dataAdapter;

  useEffect(() => {
    if (opened && schemaLength > 0) {
      // Include useFullDataset in the fetch key to trigger new fetch when mode changes
      const fetchKey = `${dataSourceVersion}-${schemaLength}-${useFullDataset ? 'full' : 'sample'}`;
      if (hasTriggeredFetch.current !== fetchKey) {
        hasTriggeredFetch.current = fetchKey;
        fetchMetadata();
      }
    } else if (!opened) {
      // Reset when panel closes
      hasTriggeredFetch.current = false;
    }
  }, [opened, dataSourceVersion, schemaLength, useFullDataset, fetchMetadata]);

  if (!opened) return null;

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        className="absolute bottom-0 left-0 right-0 bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark border-t border-borderLight-light dark:border-borderLight-dark transition-all duration-300 ease-in-out"
        style={{
          height: `${height}%`,
          boxShadow: '0px -2px 8px rgba(0, 0, 0, 0.1)',
          cursor: isResizing ? 'ns-resize' : 'default',
        }}
        data-testid={setDataTestId('metadata-stats-view')}
      >
        {/* Resize handle */}
        <div
          className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-blue-500 transition-colors"
          style={{ height: '4px' }}
          onMouseDown={handleMouseDown}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleExpanded();
            }
          }}
          aria-label="Resize metadata stats panel"
        />
        {/* Header */}
        <MetadataHeader
          loading={loading}
          metadata={metadata}
          onClose={onClose}
          onToggleExpanded={toggleExpanded}
          useFullDataset={useFullDataset}
          onToggleFullDataset={toggleFullDataset}
        />

        {/* Content */}
        <MetadataContent
          loading={loading}
          error={error}
          metadata={metadata}
          progress={progress}
          onRetry={fetchMetadata}
        />
      </div>
    </div>
  );
}
