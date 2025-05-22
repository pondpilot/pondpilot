import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import {
  IconChartHistogram,
  IconDownload,
  IconHelpCircle,
  IconMaximize,
  IconX,
  IconDatabase,
  IconTableOptions,
} from '@tabler/icons-react';
import React from 'react';

import { TableMetadata } from '../model';

interface MetadataHeaderProps {
  loading: boolean;
  metadata: TableMetadata | null;
  onClose: () => void;
  onToggleExpanded: () => void;
  useFullDataset?: boolean;
  onToggleFullDataset?: () => void;
}

export function MetadataHeader({
  loading,
  metadata,
  onClose,
  onToggleExpanded,
  useFullDataset,
  onToggleFullDataset,
}: MetadataHeaderProps) {
  return (
    <div className="flex justify-between items-center px-4 py-3 border-b border-l border-borderLight-light dark:border-borderLight-dark bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark sticky top-0 z-10">
      <div>
        <Text fw={500} className="text-base" c="text-contrast">
          Metadata View
        </Text>
        {!loading && metadata && (
          <Text size="xs" c="text-secondary">
            Table: {metadata.tableName} • Total rows: {metadata.rowCount.toLocaleString()}
            {metadata.isFullDataset ? (
              <span> • Stats computed from full dataset</span>
            ) : (
              metadata.sampleRowCount && (
                <span>
                  {' '}
                  • Stats computed from sample of {metadata.sampleRowCount.toLocaleString()} rows
                </span>
              )
            )}
          </Text>
        )}
      </div>
      <Group>
        {onToggleFullDataset && (
          <Tooltip
            label={useFullDataset ? 'Switch to sample mode' : 'Calculate on full dataset'}
            position="bottom"
          >
            <ActionIcon
              variant={useFullDataset ? 'filled' : 'subtle'}
              aria-label="Toggle full dataset mode"
              onClick={onToggleFullDataset}
              disabled={loading}
            >
              {useFullDataset ? <IconDatabase size={18} /> : <IconTableOptions size={18} />}
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label="Help">
          <ActionIcon variant="subtle" aria-label="Help">
            <IconHelpCircle size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Export Statistics">
          <ActionIcon variant="subtle" aria-label="Export">
            <IconDownload size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Show All Charts">
          <ActionIcon variant="subtle" aria-label="Show All Charts">
            <IconChartHistogram size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Toggle fullscreen">
          <ActionIcon variant="subtle" aria-label="Fullscreen" onClick={onToggleExpanded}>
            <IconMaximize size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Close">
          <ActionIcon variant="subtle" aria-label="Close" onClick={onClose}>
            <IconX size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </div>
  );
}
