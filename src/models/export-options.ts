import { NormalizedSQLType } from './db';

/**
 * Available data export formats
 */
export type ExportFormat = 'csv' | 'tsv' | 'xlsx' | 'xml' | 'sql' | 'md';

/**
 * Common export options for all formats
 */
export interface BaseExportOptions {
  includeHeader: boolean;
}

/**
 * Options specific to CSV/TSV export
 */
export interface DelimitedTextExportOptions extends BaseExportOptions {
  delimiter: string;
}

/**
 * Options specific to Excel/XLSX export
 */
export interface XlsxExportOptions extends BaseExportOptions {
  sheetName: string;
}

/**
 * Options specific to SQL export
 */
export interface SqlExportOptions extends BaseExportOptions {
  tableName: string;
  includeCreateTable: boolean;
  includeDataTypes: boolean;
}

/**
 * Options specific to Markdown export
 */
export interface MarkdownExportOptions extends BaseExportOptions {
  format: 'github' | 'standard';
  alignColumns: boolean;
}

/**
 * Options specific to XML export
 */
export interface XmlExportOptions extends BaseExportOptions {
  rootElement: string;
  rowElement: string;
}

/**
 * Union type for all export options
 */
export type ExportOptions =
  | DelimitedTextExportOptions
  | XlsxExportOptions
  | SqlExportOptions
  | MarkdownExportOptions
  | XmlExportOptions;

export const sqlTypeMap: Record<NormalizedSQLType, string> = {
  float: 'DOUBLE',
  decimal: 'DECIMAL',
  integer: 'INTEGER',
  bigint: 'BIGINT',
  boolean: 'BOOLEAN',
  date: 'DATE',
  timestamp: 'TIMESTAMP',
  timestamptz: 'TIMESTAMP WITH TIME ZONE',
  time: 'TIME',
  timetz: 'TIME WITH TIME ZONE',
  interval: 'INTERVAL',
  string: 'VARCHAR',
  bytes: 'BLOB',
  bitstring: 'BIT',
  array: 'LIST',
  object: 'JSON',
  other: 'VARCHAR',
};
