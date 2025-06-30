import { QueryResults } from '@models/ai-chat';

import { MAX_CONTEXT_ROWS, MAX_CONTEXT_CHARS_PER_CELL } from './constants';

// Custom replacer for JSON.stringify to handle BigInts
export const bigIntReplacer = (key: string, value: any) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
};

// Helper function to format query results for AI context
export const formatResultsForContext = (results: QueryResults): string => {
  const { columns, rows, rowCount, truncated } = results;

  // Sample rows if there are too many
  let sampledRows = rows;
  let sampleInfo = '';

  if (rows.length > MAX_CONTEXT_ROWS) {
    // Take first 5 and last 5 rows
    const firstRows = rows.slice(0, Math.ceil(MAX_CONTEXT_ROWS / 2));
    const lastRows = rows.slice(-Math.floor(MAX_CONTEXT_ROWS / 2));
    sampledRows = [...firstRows, ...lastRows];
    sampleInfo = ` (showing ${sampledRows.length} of ${rowCount} rows - first ${firstRows.length} and last ${lastRows.length} rows)`;
  }

  // Truncate long cell values and handle BigInt
  const truncatedData = sampledRows.map((row) =>
    row.map((cell) => {
      if (cell === null) return null;

      // Convert BigInt to string before any string operations
      let processedCell = cell;
      if (typeof cell === 'bigint') {
        processedCell = cell.toString();
      }

      const cellStr = String(processedCell);
      if (cellStr.length > MAX_CONTEXT_CHARS_PER_CELL) {
        return `${cellStr.substring(0, MAX_CONTEXT_CHARS_PER_CELL - 3)}...`;
      }
      return processedCell;
    }),
  );

  // Create JSON representation (BigInt already handled in truncatedData)
  const dataJson = truncatedData.map((row) => {
    const obj: Record<string, any> = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj;
  });

  return JSON.stringify(
    {
      columns,
      rowCount,
      truncated: truncated || rows.length > MAX_CONTEXT_ROWS,
      sampleInfo: sampleInfo || (truncated ? ' (truncated to 100 rows)' : ''),
      data: dataJson,
    },
    bigIntReplacer,
    2,
  );
};
