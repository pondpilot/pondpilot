import React from 'react';

import { ColumnMetadata, TableMetadata } from '../model';
import { ColumnHeader, ColumnVisualization } from './column-overview-item/index';

interface ColumnOverviewItemProps {
  column: ColumnMetadata;
  metadata: TableMetadata;
}

export const ColumnOverviewItem = React.memo(({ column, metadata }: ColumnOverviewItemProps) => {
  if (!column) return null;

  return (
    <div className="flex py-2 border-b border-borderLight-light dark:border-borderLight-dark items-center">
      <ColumnHeader columnName={column.name} columnType={column.type} error={column.error} />
      <div className="w-3/4">
        <ColumnVisualization column={column} totalRows={metadata.rowCount} />
      </div>
    </div>
  );
});

ColumnOverviewItem.displayName = 'ColumnOverviewItem';
