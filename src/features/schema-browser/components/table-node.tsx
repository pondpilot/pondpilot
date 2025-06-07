import { IconKey, IconLink } from '@tabler/icons-react';
import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

import { IconType, NamedIcon } from '@components/named-icon';
import { getIconTypeForSQLType } from '@components/named-icon/utils';
import {
  SCHEMA_COLORS,
  ANIMATION_DURATIONS,
  DATA_ATTRIBUTES,
} from '@features/schema-browser/constants';
import { SchemaNodeData } from '@features/schema-browser/model';
import { normalizeDuckDBColumnType } from '@utils/duckdb/sql-type';

const TableNodeComponent = ({ data }: NodeProps<SchemaNodeData>) => {
  const { label, columns, type, isHighlighted, highlightedColumns = [], isSelected } = data;

  // Determine icon based on node type
  const nodeIcon: IconType = type === 'table' ? 'db-table' : type === 'view' ? 'db-view' : 'db';

  return (
    <div
      className={`rounded-md border ${isSelected || isHighlighted ? `${SCHEMA_COLORS.SELECTED_BORDER} ${SCHEMA_COLORS.SELECTED_BORDER_WIDTH}` : SCHEMA_COLORS.DEFAULT_BORDER} bg-white dark:bg-slate-800 shadow-md min-w-[240px] ${isSelected || isHighlighted ? SCHEMA_COLORS.SELECTED_RING : ''} ${ANIMATION_DURATIONS.TRANSITION_ALL}`}
      data-testid={`schema-table-node-${data.id}`}
    >
      {/* Header */}
      <div
        className={`p-2 bg-slate-100 dark:bg-slate-700 border-b border-slate-300 dark:border-slate-600 flex items-center cursor-grab active:cursor-grabbing hover:bg-slate-200 dark:hover:bg-slate-600 ${ANIMATION_DURATIONS.TRANSITION_COLORS}`}
        {...{ [DATA_ATTRIBUTES.TABLE_HEADER]: true }}
      >
        <NamedIcon iconType={nodeIcon} className="mr-2" />
        <div className="text-sm font-semibold truncate select-text cursor-text">{label}</div>
      </div>

      {/* Columns */}
      <div className="flex flex-col divide-y divide-slate-200 dark:divide-slate-700 relative">
        {columns.map((column) => {
          return (
            <div
              key={`${label}-${column.name}`}
              className={`relative px-3 py-1.5 flex items-center text-xs ${isHighlighted && highlightedColumns.includes(column.name) ? SCHEMA_COLORS.HIGHLIGHTED_BACKGROUND : ''}`}
            >
              {/* Column property indicators */}
              <div className="flex items-center mr-2 min-w-[30px] select-none">
                {column.isPrimaryKey && (
                  <IconKey
                    size={16}
                    style={{ color: SCHEMA_COLORS.PRIMARY_KEY_COLOR }}
                    title="Primary Key"
                  />
                )}
                {column.isForeignKey && (
                  <IconLink
                    size={16}
                    style={{ color: SCHEMA_COLORS.FOREIGN_KEY_COLOR }}
                    className="mr-1"
                    title="Foreign Key"
                  />
                )}
              </div>

              {/* Column name */}
              <div className="flex-1 truncate font-medium select-text cursor-text nodrag">
                {column.name}
              </div>

              {/* Column type */}
              <div className="ml-2 text-slate-500 dark:text-slate-400 flex items-center select-none">
                <span className={`${column.isNotNull ? 'font-semibold' : ''}`}>
                  {column.sqlType}
                </span>
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

// Custom comparison function for memo to prevent unnecessary re-renders
const arePropsEqual = (
  prevProps: NodeProps<SchemaNodeData>,
  nextProps: NodeProps<SchemaNodeData>,
) => {
  const prevData = prevProps.data;
  const nextData = nextProps.data;

  // Check if basic properties are equal
  if (
    prevData.isHighlighted !== nextData.isHighlighted ||
    prevData.isSelected !== nextData.isSelected ||
    prevData.label !== nextData.label ||
    prevData.type !== nextData.type
  ) {
    return false;
  }

  // Check if highlighted columns are equal
  const prevHighlighted = prevData.highlightedColumns || [];
  const nextHighlighted = nextData.highlightedColumns || [];
  if (prevHighlighted.length !== nextHighlighted.length) {
    return false;
  }
  for (let i = 0; i < prevHighlighted.length; i += 1) {
    if (prevHighlighted[i] !== nextHighlighted[i]) {
      return false;
    }
  }

  // Check if columns are equal (assuming they don't change frequently)
  if (prevData.columns.length !== nextData.columns.length) {
    return false;
  }

  return true;
};

export const TableNode = memo(TableNodeComponent, arePropsEqual);
TableNode.displayName = 'TableNode';

export default TableNode;
