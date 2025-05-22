import { NamedIcon } from '@components/named-icon';
import { getIconTypeForSQLType } from '@components/named-icon/utils';
import { Text, Tooltip } from '@mantine/core';
import React from 'react';

import { normalizeColumnType, sanitizeDisplayValue } from '../../utils/column-types';
import { ColumnErrorIndicator } from '../column-error-indicator';

interface ColumnHeaderProps {
  columnName: string;
  columnType: string;
  error?: string;
}

export const ColumnHeader = React.memo(({ columnName, columnType, error }: ColumnHeaderProps) => {
  const iconType = getIconTypeForSQLType(normalizeColumnType(columnType));

  return (
    <div className="w-1/4 flex items-center space-x-2 pr-4 justify-start">
      <NamedIcon
        iconType={iconType}
        size={16}
        className="text-iconDefault-light dark:text-iconDefault-dark flex-shrink-0"
      />
      <Tooltip label={sanitizeDisplayValue(columnName)} position="top" withArrow>
        <Text className="text-xs truncate cursor-help">{sanitizeDisplayValue(columnName)}</Text>
      </Tooltip>
      {error && <ColumnErrorIndicator error={error} size={14} />}
    </div>
  );
});

ColumnHeader.displayName = 'ColumnHeader';
