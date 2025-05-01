import { NormalizedSQLType } from '@models/db';

import { IconType } from './named-icon';

export function getIconTypeForSQLType(type: NormalizedSQLType): IconType {
  return `column-${type}`;
}
