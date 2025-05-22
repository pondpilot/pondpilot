import { ScrollArea } from '@mantine/core';
import React from 'react';

import { ColumnStatsCard } from './column-stats-card';
import { TableMetadata } from '../model';

interface ColumnStatsPanelProps {
  metadata: TableMetadata;
}

export const ColumnStatsPanel = React.memo(({ metadata }: ColumnStatsPanelProps) => {
  return (
    <div className="w-3/4 overflow-auto bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark">
      <ScrollArea className="h-full" scrollbarSize={8}>
        <div className="p-4">
          <div className="flex items-start pb-4">
            {metadata.columns.map((column) => (
              <ColumnStatsCard key={column.name} column={column} metadata={metadata} />
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
});

ColumnStatsPanel.displayName = 'ColumnStatsPanel';
