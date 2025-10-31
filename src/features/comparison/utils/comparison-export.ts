import { sanitizeForExcel } from '@utils/export-data';

import { ComparisonResultRow } from '../hooks/use-comparison-results';

/**
 * Converts comparison results to CSV format
 */
export function comparisonToCsv(
  rows: ComparisonResultRow[],
  keyColumns: string[],
  compareColumns: string[],
): string {
  const quoteChar = '"';
  const delimiter = ',';

  // Build header row
  const headers: string[] = ['Status'];

  // Add key column headers
  keyColumns.forEach((keyCol) => {
    headers.push(keyCol.replace('_key_', ''));
  });

  // Add comparison column headers (Source A, Source B)
  compareColumns.forEach((col) => {
    headers.push(`${col} (Source A)`);
    headers.push(`${col} (Source B)`);
  });

  const headerRow = headers
    .map((h) => {
      if (h.includes(delimiter) || h.includes(quoteChar) || h.includes('\n')) {
        return `${quoteChar}${h.replace(/"/g, '""')}${quoteChar}`;
      }
      return h;
    })
    .join(delimiter);

  // Build data rows
  const dataRows = rows.map((row) => {
    const cells: string[] = [];

    // Status
    cells.push(String(row._row_status || ''));

    // Key columns
    keyColumns.forEach((keyCol) => {
      const value = row[keyCol];
      cells.push(String(value ?? ''));
    });

    // Comparison columns
    compareColumns.forEach((col) => {
      const colA = `${col}_a`;
      const colB = `${col}_b`;

      const valueA = row[colA];
      const valueB = row[colB];

      cells.push(String(valueA ?? ''));
      cells.push(String(valueB ?? ''));
    });

    // Quote and sanitize cells
    return cells
      .map((cell) => {
        const sanitized = sanitizeForExcel(cell);
        if (
          sanitized.includes(delimiter) ||
          sanitized.includes(quoteChar) ||
          sanitized.includes('\n')
        ) {
          return `${quoteChar}${sanitized.replace(/"/g, '""')}${quoteChar}`;
        }
        return sanitized;
      })
      .join(delimiter);
  });

  return [headerRow, ...dataRows].join('\n');
}

/**
 * Downloads comparison results as CSV file
 */
export function downloadComparisonCsv(
  rows: ComparisonResultRow[],
  keyColumns: string[],
  compareColumns: string[],
  fileName: string = 'comparison-results.csv',
): void {
  const csvContent = comparisonToCsv(rows, keyColumns, compareColumns);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Copies comparison results to clipboard as TSV (for pasting into Excel/Sheets)
 */
export async function copyComparisonToClipboard(
  rows: ComparisonResultRow[],
  keyColumns: string[],
  compareColumns: string[],
): Promise<void> {
  const delimiter = '\t';

  // Build header row
  const headers: string[] = ['Status'];
  keyColumns.forEach((keyCol) => {
    headers.push(keyCol.replace('_key_', ''));
  });
  compareColumns.forEach((col) => {
    headers.push(`${col} (Source A)`);
    headers.push(`${col} (Source B)`);
  });

  const headerRow = headers.join(delimiter);

  // Build data rows
  const dataRows = rows.map((row) => {
    const cells: string[] = [];

    // Status
    cells.push(String(row._row_status || ''));

    // Key columns
    keyColumns.forEach((keyCol) => {
      const value = row[keyCol];
      cells.push(String(value ?? ''));
    });

    // Comparison columns
    compareColumns.forEach((col) => {
      const colA = `${col}_a`;
      const colB = `${col}_b`;

      const valueA = row[colA];
      const valueB = row[colB];

      cells.push(String(valueA ?? ''));
      cells.push(String(valueB ?? ''));
    });

    return cells.join(delimiter);
  });

  const content = [headerRow, ...dataRows].join('\n');

  await navigator.clipboard.writeText(content);
}
