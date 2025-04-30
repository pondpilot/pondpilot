import { DataTable, DBColumn } from '@models/db';
import { stringifyTypedValue } from './db';
import { escapeField } from './helpers';

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
        value: row[col.id],
        type: col.sqlType,
      }),
    ),
  );

/**
 * Formats the rows data into a string representation
 *
 * @param {FormattedRow[]} rowsData - Array of formatted rows
 * @param {',' | '\t'} delimiter - Delimiter to use for separating values
 * @returns {string} Formatted string representation of the rows data
 */
export const formatTableData = (rowsData: FormattedRow[], delimiter: ',' | '\t'): string => {
  return rowsData.map((row) => row.map((cell) => escapeField(cell)).join(delimiter)).join('\n');
};
