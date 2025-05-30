import { IconType, NamedIcon } from '@components/named-icon';
import { getIconTypeForSQLType } from '@components/named-icon/utils';
import { IconKey, IconLink } from '@tabler/icons-react';
import { normalizeDuckDBColumnType } from '@utils/duckdb/sql-type';
import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

import { SchemaNodeData } from '../model';

const TableNodeComponent = ({ data }: NodeProps<SchemaNodeData>) => {
  const { label, columns, type, isHighlighted, highlightedColumns = [] } = data;

  // Determine icon based on node type
  const nodeIcon: IconType = type === 'table' ? 'db-table' : type === 'view' ? 'db-view' : 'db';

  return (
    <div
      className={`rounded-md border ${isHighlighted ? 'border-blue-500 border-2' : 'border-slate-300 dark:border-slate-600'} bg-white dark:bg-slate-800 shadow-md min-w-[240px] ${isHighlighted ? 'ring-4 ring-blue-300/50' : ''} transition-all duration-200`}
      data-testid={`schema-table-node-${data.id}`}
    >
      {/* Header */}
      <div className="p-2 bg-slate-100 dark:bg-slate-700 border-b border-slate-300 dark:border-slate-600 flex items-center">
        <NamedIcon iconType={nodeIcon} className="mr-2" />
        <div className="text-sm font-semibold truncate">{label}</div>
      </div>

      {/* Columns */}
      <div className="flex flex-col divide-y divide-slate-200 dark:divide-slate-700 relative">
        {columns.map((column) => {
          return (
            <div
              key={`${label}-${column.name}`}
              className={`relative px-3 py-1.5 flex items-center text-xs ${isHighlighted && highlightedColumns.includes(column.name) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
            >
              {/* Column property indicators */}
              <div className="flex items-center mr-2 min-w-[30px]">
                {column.isPrimaryKey && (
                  <IconKey size={16} className="text-[#F3A462]" title="Primary Key" />
                )}
                {column.isForeignKey && (
                  <IconLink size={16} className="text-[#4A57C1] mr-1" title="Foreign Key" />
                )}
              </div>

              {/* Column name */}
              <div className="flex-1 truncate font-medium">{column.name}</div>

              {/* Column type */}
              <div className="ml-2 text-slate-500 dark:text-slate-400 flex items-center">
                <span className={column.isNotNull ? 'font-semibold' : ''}>{column.sqlType}</span>
                <NamedIcon
                  iconType={getIconTypeForSQLType(normalizeDuckDBColumnType(column.sqlType))}
                  className={`w-3 h-3 ml-1 ${column.isNotNull ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}
                  title={column.isNotNull ? 'NOT NULL' : 'Nullable'}
                />
              </div>

              {/* Handle for relationships - positioned absolutely to align with row */}
              {column.isForeignKey && (
                <Handle
                  id={`${label}-${column.name}`}
                  type="source"
                  position={Position.Right}
                  className="w-3 h-3 bg-blue-500"
                  isConnectable
                  style={{
                    position: 'absolute',
                    top: '50%',
                    right: -8,
                    transform: 'translateY(-50%)',
                  }}
                />
              )}
              {column.isPrimaryKey && (
                <Handle
                  id={`${label}-${column.name}-target`}
                  type="target"
                  position={Position.Left}
                  className="w-3 h-3 bg-blue-500"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: -8,
                    transform: 'translateY(-50%)',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const TableNode = memo(TableNodeComponent);
TableNode.displayName = 'TableNode';

export default TableNode;
