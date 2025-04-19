import { DBTableOrViewSchema } from './db';
import { TabId } from './tab';

// Currently the only source of data views are tabs, so these are used
// as the only possible cache keys.
export type DataViewCacheKey = TabId;

export type DataViewCacheItem = {
  key: DataViewCacheKey;
  dataPage: number;
  rowFrom: number;
  rowTo: number;
  schema: DBTableOrViewSchema;
  data: Record<string, any>[];
};
