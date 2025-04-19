import { NormalizedSQLType } from '@models/db';
import { formatNumber } from '@utils/helpers';

export const stringifyTypedValue = ({
  type,
  value,
}: {
  type: NormalizedSQLType;
  value: unknown;
}): string => {
  try {
    switch (type) {
      case 'timestamp': {
        return new Date(value as string).toLocaleString();
      }
      case 'date': {
        return new Date(value as string).toLocaleDateString();
      }
      case 'time': {
        return new Date(value as string).toLocaleTimeString();
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
      case 'bytes':
      case 'other':
      case 'array':
      case 'object': {
        return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
      }
      case 'integer':
      case 'number': {
        return formatNumber(value as number);
      }
      default:
        // eslint-disable-next-line no-case-declarations
        const _: never = type;
        console.error(`Unsupported value type in a table cell: ${type}`);
        return 'N/A';
    }
  } catch (error) {
    console.error('Error in dynamicTypeViewer', error);
    return "ERROR: Can't display value";
  }
};
