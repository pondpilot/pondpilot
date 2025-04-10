export type JavaScriptArrowType =
  | 'integer'
  | 'number'
  | 'buffer'
  | 'string'
  | 'boolean'
  | 'date'
  | 'array'
  | 'object'
  | 'other';

export type ArrowColumn = {
  name: string;
  type: JavaScriptArrowType;
  nullable: boolean;
  databaseType: string;
};
