import { IconType } from '@components/named-icon/named-icon';
import { DBColumn } from '@models/db';

export { useMetadataStats } from './use-metadata-stats';
export type { MetadataStatsResult, UseMetadataStatsOptions } from './use-metadata-stats';
export { classifyColumnType } from './use-metadata-stats';

/**
 * Maps a DBColumn's sqlType to the NamedIcon iconType.
 */
export function getColumnIconType(column: DBColumn): IconType {
  return `column-${column.sqlType}` as IconType;
}
