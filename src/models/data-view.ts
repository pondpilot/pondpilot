import { ArrowColumn } from './arrow';

export type DataViewCacheKey = string & { readonly _: unique symbol };

export type DataViewCacheItem = {
  key: DataViewCacheKey;
  dataPage: number;
  rowFrom: number;
  rowTo: number;
  schema: ArrowColumn[];
  data: Record<string, any>[];
};
