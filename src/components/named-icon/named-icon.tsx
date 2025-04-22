import React from 'react';
import {
  IconCode,
  IconJson,
  IconProps,
  IconTable,
  IconSchema,
  IconDatabase,
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

export type IconType =
  /// File system
  | 'file' // unspecified file type
  | 'folder'
  | 'code-file'
  | 'xlsx'
  | 'db'
  // Database data sources
  | 'db-schema'
  | 'db-table'
  | 'db-view'
  // Local files that act as data sources
  | 'csv'
  | 'json'
  | 'parquet'
  | 'xlsx-sheet'
  // Column types
  | 'column-number'
  | 'column-integer'
  | 'column-bigint'
  | 'column-boolean'
  | 'column-date'
  | 'column-timestamp'
  | 'column-time'
  | 'column-string'
  | 'column-bytes'
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
    case 'db-schema':
      return <IconSchema {...iconProps} />;
    case 'db-table':
      return <IconTable {...iconProps} />;
    case 'db-view':
      return <IconTableAlias {...iconProps} />;
    case 'column-string':
      return <IconLetterCaseToggle {...iconProps} />;
    case 'column-number':
    case 'column-integer':
    case 'column-bigint':
      return <Icon123 {...iconProps} />;
    case 'column-boolean':
      return <IconCheck {...iconProps} />;
    case 'column-date':
      return <IconCalendar {...iconProps} />;
    case 'column-timestamp':
      return <IconCalendar {...iconProps} />;
    case 'column-time':
      return <IconClock {...iconProps} />;
    case 'column-bytes':
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
