import { DataTable, DBColumn } from '@models/db';
import { stringifyTypedValue } from './db';
import { escapeCSVField } from './helpers';

type FormattedRow = string[];

/**
 * Formats row data based on column SQL types
 *
 * @param {Record<string, any>[]} data - Array of data objects with key-value pairs
 * @param {DBColumn[]} columns - Database column definitions
 * @returns {string[][]} Array of formatted row values
 */
export const getStringifyTypedRows = (data: DataTable, columns: DBColumn[]): FormattedRow[] =>
  data.map((row) =>
    columns.map((col) =>
      stringifyTypedValue({
        value: row[col.name],
        type: col.sqlType,
      }),
    ),
  );

/**
 * Converts table data to CSV format
 *
 * @param {FormattedRow[]} rowsData - Formatted row data
 * @returns {string} CSV formatted rows
 */
export const formatTableDataAsCSV = (rowsData: FormattedRow[]): string => {
  return rowsData.map((row) => row.map((cell) => escapeCSVField(cell)).join(',')).join('\n');
};

/**
 * Converts table data to TSV (Tab-Separated Values) format
 *
 * @param {FormattedRow[]} rowsData - Formatted row data
 * @returns {string} TSV formatted rows
 */
export const formatTableDataAsTSV = (rowsData: FormattedRow[]): string => {
  return rowsData.map((row) => row.map((cell) => cell).join('\t')).join('\n');
};
