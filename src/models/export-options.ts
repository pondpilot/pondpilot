import { NormalizedSQLType } from './db';

/**
 * Available data export formats
 */
export type ExportFormat = 'csv' | 'tsv' | 'xlsx' | 'xml' | 'sql' | 'md' | 'parquet';

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
 * Valid Parquet compression codecs — the single source of truth for validation and UI.
 */
export const PARQUET_COMPRESSIONS = ['snappy', 'gzip', 'zstd', 'uncompressed'] as const;

/**
 * Parquet compression codec options
 */
export type ParquetCompression = (typeof PARQUET_COMPRESSIONS)[number];

/**
 * Options specific to Parquet export
 */
export interface ParquetExportOptions extends BaseExportOptions {
  compression: ParquetCompression;
}

/**
 * Union type for all export options
 */
export type ExportOptions =
  | DelimitedTextExportOptions
  | XlsxExportOptions
  | SqlExportOptions
  | MarkdownExportOptions
  | XmlExportOptions
  | ParquetExportOptions;

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
