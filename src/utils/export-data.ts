import { DataAdapterApi } from '@models/data-adapter';
import {
  BaseExportOptions,
  DelimitedTextExportOptions,
  ExportFormat,
  MarkdownExportOptions,
  SqlExportOptions,
  XlsxExportOptions,
  XmlExportOptions,
  sqlTypeMap,
} from '@models/export-options';
import { quote } from '@utils/helpers';
import { formatTableData, getStringifyTypedRows } from '@utils/table';

/**
 * Sanitizes a string to be safe for use in a filename
 * Removes illegal characters and replaces some characters with safer alternatives
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[<>:"\\|?*]/g, '_')
    .replace(/\//g, '_')
    .replace(/^\.+/, '_')
    .replace(/\.+$/, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sanitizes a cell value to prevent formula injection in spreadsheet applications
 */
export function sanitizeForExcel(value: string): string {
  // If value starts with =, +, -, @, it could be a formula injection attempt
  if (value && typeof value === 'string' && /^[=+\-@]/.test(value)) {
    // Prepend a single quote to neutralize the formula
    return `'${value}`;
  }
  return value;
}

/**
 * Creates file name for export based on tab name and format
 */
export function createExportFileName(tabName: string, format: ExportFormat): string {
  const sanitizedName = sanitizeFileName(tabName);
  const extension = format === 'tsv' ? 'tsv' : format;
  return `${sanitizedName}.${extension}`;
}

/**
 * Exports data as CSV or TSV
 */
export async function exportAsDelimitedText(
  dataAdapter: DataAdapterApi,
  options: DelimitedTextExportOptions,
  fileName: string,
): Promise<void> {
  const data = await dataAdapter.getAllTableData(null);
  const columns = dataAdapter.currentSchema;

  const formattedRows = getStringifyTypedRows(data, columns, '');

  // Sanitize values to prevent formula injection
  const sanitizedRows = formattedRows.map((row) => row.map((value) => sanitizeForExcel(value)));

  // Format the data rows with the appropriate delimiter
  const dataContent = formatTableData(sanitizedRows, options.delimiter as ',' | '\t');

  let content = '';

  if (options.includeHeader) {
    const headerRow = columns
      .map((col) => {
        const headerText = col.name;
        // Handle special characters in header
        if (
          headerText.includes(options.delimiter) ||
          headerText.includes(options.quoteChar) ||
          headerText.includes('\n')
        ) {
          const escaped = headerText.replace(
            new RegExp(options.quoteChar, 'g'),
            options.escapeChar + options.quoteChar,
          );
          return options.quoteChar + escaped + options.quoteChar;
        }
        return headerText;
      })
      .join(options.delimiter);

    content = `${headerRow}\n${dataContent}`;
  } else {
    content = dataContent;
  }

  downloadFile(content, fileName, 'text/plain;charset=utf-8');
}

/**
 * Exports data as Excel/XLSX
 */
export async function exportAsXlsx(
  dataAdapter: DataAdapterApi,
  options: XlsxExportOptions,
  fileName: string,
): Promise<void> {
  const data = await dataAdapter.getAllTableData(null);
  const columns = dataAdapter.currentSchema;

  const wsData = options.includeHeader ? [columns.map((col) => col.name)] : [];

  data.forEach((row) => {
    const rowData = columns.map((col) => {
      const value = row[col.id]; // Use col.id instead of col.name
      if (value === null || value === undefined) {
        return '';
      }

      // If it's a string, sanitize it to prevent formula injection
      return typeof value === 'string' ? sanitizeForExcel(value) : value;
    });
    wsData.push(rowData);
  });

  try {
    const XLSX = await import('xlsx');

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, options.sheetName);

    const xlsxData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    downloadFile(
      new Blob([xlsxData], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      fileName,
    );
  } catch (error) {
    console.error('Failed to load Excel export library:', error);
    throw new Error(
      'Could not load Excel export functionality. Please try again or use another format.',
    );
  }
}

/**
 * Quotes a SQL identifier (table or column name) using ANSI standard double quotes
 * Escapes any double quotes within the identifier
 */
function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Exports data as SQL INSERT statements with optional CREATE TABLE
 */
export async function exportAsSql(
  dataAdapter: DataAdapterApi,
  options: SqlExportOptions,
  fileName: string,
): Promise<void> {
  const data = await dataAdapter.getAllTableData(null);
  const columns = dataAdapter.currentSchema;

  let sqlContent = '';

  if (options.includeCreateTable) {
    sqlContent += `DROP TABLE IF EXISTS ${quoteIdentifier(options.tableName)};\n`;
    sqlContent += `CREATE TABLE ${quoteIdentifier(options.tableName)} (\n`;

    const columnDefinitions = columns.map((col) => {
      if (options.includeDataTypes) {
        const sqlType = sqlTypeMap[col.sqlType];
        return `  ${quoteIdentifier(col.name)} ${sqlType}${col.nullable ? '' : ' NOT NULL'}`;
      }
      return `  ${quoteIdentifier(col.name)}`;
    });

    sqlContent += columnDefinitions.join(',\n');
    sqlContent += '\n);\n\n';
  }

  // Generate INSERT statements
  const quotedColumnNames = columns.map((col) => quoteIdentifier(col.name)).join(', ');
  const unquotedColumnNames = columns.map((col) => col.name).join(', ');

  if (options.includeHeader) {
    sqlContent += `-- Inserting data into ${options.tableName}\n`;
    sqlContent += `-- Columns: ${unquotedColumnNames}\n\n`;
  }

  const BATCH_SIZE = 100;
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);

    sqlContent += `INSERT INTO ${quoteIdentifier(options.tableName)} (${quotedColumnNames}) VALUES\n`;

    const valueRows = batch.map((row) => {
      const values = columns.map((col) => {
        const value = row[col.id];

        if (value === null || value === undefined) {
          return 'NULL';
        }

        switch (col.sqlType) {
          case 'string':
          case 'date':
          case 'timestamp':
          case 'time':
            return quote(String(value), { single: true });
          case 'boolean':
            return value ? 'TRUE' : 'FALSE';
          default:
            return String(value);
        }
      });

      return `(${values.join(', ')})`;
    });

    sqlContent += valueRows.join(',\n');
    sqlContent += ';\n\n';
  }

  downloadFile(sqlContent, fileName, 'text/plain;charset=utf-8');
}

/**
 * Validates if a string is a valid XML element name
 * XML element names must:
 * - Start with a letter or underscore
 * - Contain only letters, digits, hyphens, underscores, and periods
 * - Not start with "xml" (case-insensitive)
 */
export function isValidXmlElementName(name: string): boolean {
  if (!name || name.length === 0) return false;

  // Check if starts with "xml" (case-insensitive) - reserved
  if (name.toLowerCase().startsWith('xml')) return false;

  // Must start with letter or underscore
  if (!/^[a-zA-Z_]/.test(name)) return false;

  // Can only contain letters, digits, hyphens, underscores, and periods
  if (!/^[a-zA-Z_][a-zA-Z0-9_\-.]*$/.test(name)) return false;

  return true;
}

/**
 * Sanitizes a string to be a valid XML element name
 * - Replaces invalid characters with underscores
 * - Ensures it starts with a valid character
 * - Handles reserved names
 */
function sanitizeXmlElementName(name: string): string {
  if (!name || name.length === 0) return 'element';

  // If starts with "xml" (case-insensitive), prepend underscore
  if (name.toLowerCase().startsWith('xml')) {
    name = `_${name}`;
  }

  // Replace invalid characters with underscores
  let sanitized = name.replace(/[^a-zA-Z0-9_\-.]/g, '_');

  // If doesn't start with letter or underscore, prepend underscore
  if (!/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }

  return sanitized;
}

/**
 * Exports data as XML
 */
export async function exportAsXml(
  dataAdapter: DataAdapterApi,
  options: XmlExportOptions,
  fileName: string,
): Promise<void> {
  const data = await dataAdapter.getAllTableData(null);
  const columns = dataAdapter.currentSchema;

  let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xmlContent += `<${options.rootElement}>\n`;

  data.forEach((row) => {
    xmlContent += `  <${options.rowElement}>\n`;

    columns.forEach((col) => {
      const value = row[col.id];
      const columnName = sanitizeXmlElementName(col.name);

      if (value !== null && value !== undefined) {
        const escapedValue = String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');

        xmlContent += `    <${columnName}>${escapedValue}</${columnName}>\n`;
      } else if (options.includeHeader) {
        xmlContent += `    <${columnName}/>\n`;
      }
    });

    xmlContent += `  </${options.rowElement}>\n`;
  });

  xmlContent += `</${options.rootElement}>`;

  downloadFile(xmlContent, fileName, 'application/xml;charset=utf-8');
}

/**
 * Exports data as Markdown table
 */
export async function exportAsMarkdown(
  dataAdapter: DataAdapterApi,
  options: MarkdownExportOptions,
  fileName: string,
): Promise<void> {
  const data = await dataAdapter.getAllTableData(null);
  const columns = dataAdapter.currentSchema;

  // Format data rows using the utility from table.ts
  // Using empty string as nullRepr to convert NULL values to empty strings
  const formattedRows = getStringifyTypedRows(data, columns, '');

  let mdContent = '';

  // Find the maximum width for each column if alignment is enabled
  const colWidths: number[] = [];

  if (options.alignColumns) {
    // Calculate column widths
    columns.forEach((col, colIndex) => {
      let maxWidth = col.name.length;

      formattedRows.forEach((row) => {
        maxWidth = Math.max(maxWidth, row[colIndex].length);
      });

      colWidths[colIndex] = maxWidth;
    });
  }

  // Add header row if needed
  if (options.includeHeader) {
    if (options.alignColumns) {
      mdContent += `| ${columns
        .map((col, i) => col.name.padEnd(colWidths[i], ' '))
        .join(' | ')} |\n`;

      // Add separator row
      mdContent += `| ${columns.map((_, i) => '-'.repeat(colWidths[i])).join(' | ')} |\n`;
    } else {
      mdContent += `| ${columns.map((col) => col.name).join(' | ')} |\n`;
      mdContent += `| ${columns.map(() => '---').join(' | ')} |\n`;
    }
  }

  // Add data rows
  formattedRows.forEach((row) => {
    if (options.alignColumns) {
      mdContent += `| ${row.map((value, i) => value.padEnd(colWidths[i], ' ')).join(' | ')} |\n`;
    } else {
      mdContent += `| ${row.join(' | ')} |\n`;
    }
  });

  downloadFile(mdContent, fileName, 'text/markdown;charset=utf-8');
}

/**
 * Helper function to download a file
 */
function downloadFile(content: string | Blob, fileName: string, mimeType?: string): void {
  const blob =
    typeof content === 'string'
      ? new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' })
      : content;

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
 * Main function to export data in the specified format
 *
 * NOTE: This currently loads all data at once which could be memory-intensive
 * for large datasets. A future enhancement should implement streaming export
 * for larger datasets to prevent browser crashes.
 */
export async function exportData(
  dataAdapter: DataAdapterApi,
  format: ExportFormat,
  options: BaseExportOptions,
  fileName: string,
): Promise<void> {
  switch (format) {
    case 'csv':
      await exportAsDelimitedText(
        dataAdapter,
        {
          ...options,
          delimiter: ',',
          quoteChar: '"',
          escapeChar: '"',
        } as DelimitedTextExportOptions,
        fileName,
      );
      break;
    case 'tsv':
      await exportAsDelimitedText(
        dataAdapter,
        {
          ...options,
          delimiter: '\t',
          quoteChar: '"',
          escapeChar: '"',
        } as DelimitedTextExportOptions,
        fileName,
      );
      break;
    case 'xlsx':
      await exportAsXlsx(dataAdapter, options as XlsxExportOptions, fileName);
      break;
    case 'sql':
      await exportAsSql(dataAdapter, options as SqlExportOptions, fileName);
      break;
    case 'xml':
      await exportAsXml(dataAdapter, options as XmlExportOptions, fileName);
      break;
    case 'md':
      await exportAsMarkdown(dataAdapter, options as MarkdownExportOptions, fileName);
      break;
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}
