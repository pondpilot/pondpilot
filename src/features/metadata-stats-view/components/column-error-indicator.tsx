import { Tooltip } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import React from 'react';

interface ColumnErrorIndicatorProps {
  error: string;
  size?: number;
}

export const ColumnErrorIndicator = React.memo(
  ({ error, size = 16 }: ColumnErrorIndicatorProps) => {
    return (
      <Tooltip
        label={`Column processing failed: ${error}`}
        position="top"
        withArrow
        multiline
        w={250}
      >
        <IconAlertTriangle size={size} className="text-yellow-500 flex-shrink-0 cursor-help" />
      </Tooltip>
    );
  },
);

ColumnErrorIndicator.displayName = 'ColumnErrorIndicator';
