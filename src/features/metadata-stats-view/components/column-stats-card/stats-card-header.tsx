import { NamedIcon } from '@components/named-icon';
import { getIconTypeForSQLType } from '@components/named-icon/utils';
import { Text } from '@mantine/core';
import React from 'react';

import { normalizeColumnType, sanitizeDisplayValue } from '../../utils/column-types';
import { ColumnErrorIndicator } from '../column-error-indicator';

interface StatsCardHeaderProps {
  columnName: string;
  columnType: string;
  distinctCount: number;
  error?: string;
}

export const StatsCardHeader = React.memo(
  ({ columnName, columnType, distinctCount, error }: StatsCardHeaderProps) => {
    const iconType = getIconTypeForSQLType(normalizeColumnType(columnType));
    const distinctLabel = distinctCount.toLocaleString();

    return (
      <div className="bg-backgroundTertiary-light dark:bg-backgroundTertiary-dark px-3 py-2 border-b border-borderLight-light dark:border-borderLight-dark">
        <div className="flex items-center justify-between">
          <div className="flex items-center truncate">
            <NamedIcon
              iconType={iconType}
              size={16}
              className="text-iconDefault-light dark:text-iconDefault-dark"
            />
            <Text fw={500} c="text-contrast" className="text-sm truncate ml-1">
              {sanitizeDisplayValue(columnName)}
            </Text>
            {error && <ColumnErrorIndicator error={error} size={14} />}
          </div>
          <Text size="xs" c="text-secondary" className="ml-2 whitespace-nowrap">
            {distinctLabel}
          </Text>
        </div>
      </div>
    );
  },
);

StatsCardHeader.displayName = 'StatsCardHeader';
