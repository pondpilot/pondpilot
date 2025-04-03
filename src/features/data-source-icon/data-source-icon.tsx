import React from 'react';
import { IconCode, IconCsv, IconJson, IconProps, IconTable } from '@tabler/icons-react';
import { DataSourceIconType } from '@models/data-source';

interface DataSourceIconProps extends IconProps {
  iconType: DataSourceIconType;
}

export const DataSourceIcon: React.FC<DataSourceIconProps> = ({ iconType, ...iconProps }) => {
  // Dynamically return an icon based on iconType
  switch (iconType) {
    case 'sql-script':
      return <IconCode {...iconProps} />;
    case 'csv':
      return <IconCsv {...iconProps} />;
    case 'json':
      return <IconJson {...iconProps} />;
    case 'table':
    default:
      return <IconTable {...iconProps} />;
  }
};

export default DataSourceIcon;
