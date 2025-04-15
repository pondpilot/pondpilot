import { NormalizedSQLType } from '@models/db';
import { assertNeverValueType } from './typing';

export function isNumberType(type: NormalizedSQLType): boolean {
  switch (type) {
    case 'bigint':
    case 'number':
    case 'integer':
    case 'date':
    case 'time':
    case 'timestamp':
      return true;
    case 'boolean':
    case 'string':
    case 'bytes':
    case 'array':
    case 'object':
    case 'other':
      return false;
    default:
      assertNeverValueType(type);
      return false;
  }
}
