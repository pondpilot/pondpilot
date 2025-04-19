import { NormalizedSQLType } from '@models/db';

export type ColumnMeta = { type: NormalizedSQLType; name: string };
export type TableMeta = { rowOffset: number };
