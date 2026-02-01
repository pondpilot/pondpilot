import { DataAdapterApi } from './data-adapter';
import {
  BaseExportOptions,
  DelimitedTextExportOptions,
  ExportFormat,
  MarkdownExportOptions,
  ParquetExportOptions,
  SqlExportOptions,
  XlsxExportOptions,
  XmlExportOptions,
} from './export-options';

/**
 * Defines a single export format entry in the registry.
 * Each format is self-describing — all UI and export logic derives from these definitions.
 */
export interface ExportFormatDefinition {
  /** Unique key identifying the format (e.g. 'csv', 'parquet') */
  key: ExportFormat;
  /** Human-readable label (e.g. 'CSV', 'Parquet') */
  label: string;
  /** File extension without dot (e.g. 'csv', 'parquet') */
  extension: string;
  /** Constructs the default options object for this format */
  buildDefaultOptions: () => BaseExportOptions;
  /** Executes the export for this format */
  exportFn: (
    dataAdapter: DataAdapterApi,
    options: BaseExportOptions,
    fileName: string,
  ) => Promise<void>;
}

/**
 * The format registry — a single source of truth for all supported export formats.
 * Adding a new format only requires appending an entry here and adding the key
 * to the ExportFormat union in export-options.ts.
 */
export const exportFormatRegistry: ExportFormatDefinition[] = [
  {
    key: 'csv',
    label: 'CSV',
    extension: 'csv',
    buildDefaultOptions: () => ({ includeHeader: true, delimiter: ',' }),
    exportFn: async (dataAdapter, options, fileName) => {
      const { exportAsDelimitedText } = await import('@utils/export-data');
      await exportAsDelimitedText(dataAdapter, options as DelimitedTextExportOptions, fileName);
    },
  },
  {
    key: 'tsv',
    label: 'TSV',
    extension: 'tsv',
    buildDefaultOptions: () => ({ includeHeader: true, delimiter: '\t' }),
    exportFn: async (dataAdapter, options, fileName) => {
      const { exportAsDelimitedText } = await import('@utils/export-data');
      await exportAsDelimitedText(dataAdapter, options as DelimitedTextExportOptions, fileName);
    },
  },
  {
    key: 'xlsx',
    label: 'Excel',
    extension: 'xlsx',
    buildDefaultOptions: () => ({ includeHeader: true, sheetName: 'Sheet1' }),
    exportFn: async (dataAdapter, options, fileName) => {
      const { exportAsXlsx } = await import('@utils/export-data');
      await exportAsXlsx(dataAdapter, options as XlsxExportOptions, fileName);
    },
  },
  {
    key: 'sql',
    label: 'SQL',
    extension: 'sql',
    buildDefaultOptions: () => ({
      includeHeader: true,
      tableName: 'exported_table',
      includeCreateTable: true,
      includeDataTypes: true,
    }),
    exportFn: async (dataAdapter, options, fileName) => {
      const { exportAsSql } = await import('@utils/export-data');
      await exportAsSql(dataAdapter, options as SqlExportOptions, fileName);
    },
  },
  {
    key: 'xml',
    label: 'XML',
    extension: 'xml',
    buildDefaultOptions: () => ({
      includeHeader: true,
      rootElement: 'data',
      rowElement: 'row',
    }),
    exportFn: async (dataAdapter, options, fileName) => {
      const { exportAsXml } = await import('@utils/export-data');
      await exportAsXml(dataAdapter, options as XmlExportOptions, fileName);
    },
  },
  {
    key: 'md',
    label: 'Markdown',
    extension: 'md',
    buildDefaultOptions: () => ({
      includeHeader: true,
      format: 'github',
      alignColumns: true,
    }),
    exportFn: async (dataAdapter, options, fileName) => {
      const { exportAsMarkdown } = await import('@utils/export-data');
      await exportAsMarkdown(dataAdapter, options as MarkdownExportOptions, fileName);
    },
  },
  {
    key: 'parquet',
    label: 'Parquet',
    extension: 'parquet',
    buildDefaultOptions: () => ({
      includeHeader: true,
      compression: 'snappy',
    }),
    exportFn: async (dataAdapter, options, fileName) => {
      const { exportAsParquet } = await import('@utils/export-data');
      await exportAsParquet(dataAdapter, options as ParquetExportOptions, fileName);
    },
  },
];

/**
 * Format options for UI selectors, derived from the registry.
 */
export const formatOptions = exportFormatRegistry.map((def) => ({
  label: def.label,
  value: def.key,
}));

/**
 * Looks up a format definition by key. Returns undefined if not found.
 */
export function getFormatDefinition(key: string): ExportFormatDefinition | undefined {
  return exportFormatRegistry.find((def) => def.key === key);
}

/**
 * Gets the file extension for a given format key.
 * Falls back to the key itself if the format is not found.
 */
export function getFormatExtension(key: string): string {
  return getFormatDefinition(key)?.extension ?? key;
}
