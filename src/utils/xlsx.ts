import * as XLSX from 'xlsx';

/**
 * Get all sheet names from an XLSX file
 * @param file The XLSX file
 * @returns Array of sheet names
 */
export async function getXlsxSheetNames(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  return workbook.SheetNames;
}

/**
 * Creates a DuckDB view query for a specific sheet in an XLSX file
 * @param fileName XLSX file name in DuckDB's file system
 * @param sheetName Sheet name within the XLSX file
 * @param viewName Name for the created view
 * @returns SQL query to create a view for the sheet
 */
export function createXlsxSheetViewQuery(
  fileName: string,
  sheetName: string,
  viewName: string
): string {
  return `CREATE OR REPLACE VIEW ${viewName} AS SELECT * FROM read_xlsx('${fileName}', sheet='${sheetName}');`;
}
