import DuckIcon from '@assets/duck-bw.svg?react';
import {
  IconCode,
  IconJson,
  IconProps,
  IconTable,
  IconSchema,
  IconDatabase,
  IconServer,
  IconFolder,
  IconFileTypeCsv,
  IconTableAlias,
  IconFileTypeXls,
  IconQuestionMark,
  IconFile,
  IconCalendar,
  IconClock,
  IconCheck,
  Icon123,
  IconLetterCaseToggle,
  IconNumber10,
  IconBrackets,
} from '@tabler/icons-react';
import React from 'react';

export type IconType =
  /// File system
  | 'file' // unspecified file type
  | 'folder'
  | 'code-file'
  | 'xlsx'
  | 'db'
  | 'duck' // PondPilot system database
  // Database data sources
  | 'db-schema'
  | 'db-table'
  | 'db-view'
  // Remote database types
  | 'httpserver-db'
  // Local files that act as data sources
  | 'csv'
  | 'json'
  | 'parquet'
  | 'xlsx-sheet'
  // Column types
  | 'column-float'
  | 'column-decimal'
  | 'column-integer'
  | 'column-bigint'
  | 'column-boolean'
  | 'column-date'
  | 'column-timestamp'
  | 'column-timestamptz'
  | 'column-time'
  | 'column-timetz'
  | 'column-interval'
  | 'column-string'
  | 'column-bytes'
  | 'column-bitstring'
  | 'column-array'
  | 'column-object'
  | 'column-other'
  // In case of errors have a fallback icon
  | 'error';

interface NamedIconProps extends IconProps {
  iconType: IconType;
}

export const NamedIcon: React.FC<NamedIconProps> = ({ iconType, ...iconProps }) => {
  // Dynamically return an icon based on iconType
  switch (iconType) {
    case 'file':
      return <IconFile {...iconProps} />;
    case 'folder':
      return <IconFolder {...iconProps} />;
    case 'code-file':
      return <IconCode {...iconProps} />;
    case 'db':
      return <IconDatabase {...iconProps} />;
    case 'duck': {
      const { stroke: _stroke, ...duckIconProps } = iconProps;
      return (
        <DuckIcon
          {...duckIconProps}
          className={iconProps.className}
          style={{ width: iconProps.size, height: iconProps.size }}
        />
      );
    }
    case 'db-schema':
      return <IconSchema {...iconProps} />;
    case 'db-table':
      return <IconTable {...iconProps} />;
    case 'db-view':
      return <IconTableAlias {...iconProps} />;
    case 'httpserver-db':
      return <IconServer {...iconProps} />;
    case 'column-float':
    case 'column-decimal':
    case 'column-integer':
    case 'column-bigint':
      return <Icon123 {...iconProps} />;
    case 'column-boolean':
      return <IconCheck {...iconProps} />;
    case 'column-date':
      return <IconCalendar {...iconProps} />;
    case 'column-timestamp':
    case 'column-timestamptz':
      return <IconCalendar {...iconProps} />;
    case 'column-time':
    case 'column-timetz':
      return <IconClock {...iconProps} />;
    case 'column-interval':
      return <IconClock {...iconProps} />;
    case 'column-string':
      return <IconLetterCaseToggle {...iconProps} />;
    case 'column-bytes':
    case 'column-bitstring':
      return <IconNumber10 {...iconProps} />;
    case 'column-array':
      return <IconBrackets {...iconProps} />;
    case 'column-object':
      return <IconCode {...iconProps} />;
    case 'column-other':
      return <IconQuestionMark {...iconProps} />;
    case 'csv':
      return <IconFileTypeCsv {...iconProps} />;
    case 'json':
      return <IconJson {...iconProps} />;
    case 'parquet':
      return <IconTable {...iconProps} />;
    case 'xlsx':
      return <IconFileTypeXls {...iconProps} />;
    case 'xlsx-sheet':
      return <IconTable {...iconProps} />;

    case 'error':
      return <IconQuestionMark {...iconProps} />;
    default:
      // eslint-disable-next-line no-case-declarations
      const _: never = iconType;
      return <IconTable {...iconProps} />;
  }
};

export default NamedIcon;
