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
  // In case of errors have a fallback icon
  | 'error';

interface ListViewIconProps extends IconProps {
  iconType: IconType;
}

export const ListViewIcon: React.FC<ListViewIconProps> = ({ iconType, ...iconProps }) => {
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

export default ListViewIcon;
