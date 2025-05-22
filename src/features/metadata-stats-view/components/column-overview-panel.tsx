import { NamedIcon } from '@components/named-icon';
import { ScrollArea, Text } from '@mantine/core';
import React from 'react';

import { ColumnOverviewItem } from './column-overview-item';
import { TableMetadata } from '../model';

interface ColumnOverviewPanelProps {
  metadata: TableMetadata;
}

export const ColumnOverviewPanel = React.memo(({ metadata }: ColumnOverviewPanelProps) => {
  return (
    <div className="w-1/4 overflow-auto bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark">
      <ScrollArea className="h-full" scrollbarSize={8}>
        <div className="p-4">
          <div className="p-4">
            <div className="flex -mx-4 -mt-4">
              <div className="w-1/4 bg-backgroundTertiary-light dark:bg-backgroundTertiary-dark px-3 py-3 border-b border-borderLight-light dark:border-borderLight-dark rounded-tl-xl">
                <div className="flex items-center space-x-1">
                  <Text fw={500} c="text-contrast" className="text-sm">
                    Column Name
                  </Text>
                </div>
              </div>
              <div className="w-3/4 bg-backgroundTertiary-light dark:bg-backgroundTertiary-dark px-3 py-3 border-b border-borderLight-light dark:border-borderLight-dark rounded-tr-xl">
                <div className="flex items-center space-x-1">
                  <NamedIcon
                    iconType="column-string"
                    size={14}
                    className="text-iconDefault-light dark:text-iconDefault-dark"
                  />
                  <Text fw={500} c="text-contrast" className="text-sm">
                    COUNTD %
                  </Text>
                  <Text size="xs" c="text-secondary">
                    |
                  </Text>
                  <NamedIcon
                    iconType="column-integer"
                    size={14}
                    className="text-iconDefault-light dark:text-iconDefault-dark"
                  />
                  <Text fw={500} c="text-contrast" className="text-sm">
                    Freq. Distr
                  </Text>
                </div>
              </div>
            </div>
            <div>
              {metadata.columns.map((column) => (
                <ColumnOverviewItem key={column.name} column={column} metadata={metadata} />
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
});

ColumnOverviewPanel.displayName = 'ColumnOverviewPanel';
