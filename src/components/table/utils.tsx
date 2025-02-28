/* eslint-disable no-console */
import { IconNumber123, IconCalendarStats, IconTextSize } from '@tabler/icons-react';
import { formatNumber } from '@utils/helpers';
import { DynamicTypeViewerProps } from './models';

export const getIcon = (colType: string) =>
  ({
    integer: <IconNumber123 size={16} />,
    date: <IconCalendarStats size={16} />,
    number: <IconNumber123 size={16} />,
  })[colType] || <IconTextSize size={16} />;

export const dynamicTypeViewer = (props: DynamicTypeViewerProps): string => {
  const { type, value } = props;

  try {
    switch (type) {
      case 'date': {
        const date = new Date(value as string);
        return date.toLocaleString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
      }
      case 'string': {
        return value as string;
      }
      case 'bigint': {
        return (value as bigint).toString();
      }
      case 'boolean': {
        return `${value}` as string;
      }
      case 'other': {
        return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
      }
      case 'integer':
      case 'number': {
        return formatNumber(value as number);
      }
      default:
        return '';
    }
  } catch (error) {
    console.log('Error in dynamicTypeViewer', error);
    return 'N/A';
  }
};
