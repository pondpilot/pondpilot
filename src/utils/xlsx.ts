import * as XLSX from 'xlsx';
import * as fflate from 'fflate';
import { quote } from './helpers';

// File size thresholds
const MB = 1024 * 1024;
const LARGE_FILE_THRESHOLD = 50 * MB; // use optimized extraction
const SIGNATURE_CHECK_THRESHOLD = 5 * MB; // check signature before processing

// Optimized options for SheetJS to only read sheet names, not data
const SHEET_NAMES_ONLY_OPTIONS = {
  type: 'array' as const,
  bookSheets: true,
  bookProps: false,
  bookVBA: false,
  cellFormula: false,
  cellHTML: false,
  cellNF: false,
  cellStyles: false,
  cellText: false,
  cellDates: false,
  sheetStubs: false,
  sheetRows: 0,
};

/**
 * Check if a file is a valid XLSX file by examining its signature bytes
 *
 * @param buffer The file buffer to check
 * @returns True if the file appears to be a valid XLSX file
 */
function isValidXlsxFile(buffer: ArrayBuffer | Uint8Array): boolean {
  if (!(buffer instanceof Uint8Array)) {
    buffer = new Uint8Array(buffer);
  }

  // Check ZIP signature (PK\x03\x04)
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x50 || // P
    buffer[1] !== 0x4b || // K
    buffer[2] !== 0x03 || // \x03
    buffer[3] !== 0x04 // \x04
  ) {
    return false;
  }

  return true;
}

/**
 * Get sheet names from an XLSX file using SheetJS with optimized options
 *
 * @param arrayBuffer The XLSX file as an ArrayBuffer
 * @returns Array of sheet names
 */
function getSheetNamesWithSheetJS(arrayBuffer: ArrayBuffer): string[] {
  try {
    const workbook = XLSX.read(arrayBuffer, SHEET_NAMES_ONLY_OPTIONS);
    return workbook.SheetNames;
  } catch (error) {
    // If SheetJS fails completely, return empty array
    return [];
  }
}

/**
 * Extract sheet names directly from workbook.xml inside XLSX (ZIP) file
 * This is much more efficient for large files than using SheetJS
 *
 * @param buf The XLSX file as a Uint8Array
 * @returns Array of sheet names or null if extraction failed
 */
function extractSheetNamesFromZip(buf: Uint8Array): string[] | null {
  try {
    // Common paths where workbook.xml might be found
    const workbookPaths = ['xl/workbook.xml', 'xl\\workbook.xml', 'workbook.xml'];

    // Only extract workbook.xml file to save memory
    const files = fflate.unzipSync(buf, {
      filter: (path) =>
        workbookPaths.includes(path) ||
        (path.toLowerCase().includes('workbook') && path.toLowerCase().endsWith('.xml')),
    });

    let workbookFile: Uint8Array | undefined;

    for (const path of workbookPaths) {
      if (files[path]) {
        workbookFile = files[path];
        break;
      }
    }

    // If not found, try to find any file that might be workbook.xml
    if (!workbookFile) {
      const workbookKeys = Object.keys(files).filter(
        (key) => key.toLowerCase().includes('workbook') && key.toLowerCase().endsWith('.xml'),
      );

      if (workbookKeys.length > 0) {
        workbookFile = files[workbookKeys[0]];
      }
    }

    if (!workbookFile) {
      return null; // Couldn't find workbook.xml
    }

    const xmlText = new TextDecoder('utf-8').decode(workbookFile);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

    // Try different ways to find sheet elements
    let sheetEls = xmlDoc.getElementsByTagName('sheet');

    if (sheetEls.length === 0) {
      // Try with namespace wildcard
      sheetEls = xmlDoc.querySelectorAll('*|sheet') as NodeListOf<Element>;
    }

    if (sheetEls.length === 0) {
      return null; // No sheets found
    }

    const result: string[] = [];
    for (let i = 0; i < sheetEls.length; i += 1) {
      const name = sheetEls[i].getAttribute('name');
      if (name) result.push(name);
    }

    return result;
  } catch (error) {
    // If any error occurs during ZIP extraction or XML parsing, return null
    return null;
  }
}

/**
 * Efficiently extracts sheet names from an XLSX file
 * Uses optimized approaches based on file size to minimize memory usage
 *
 * @param file The XLSX file
 * @returns Array of sheet names
 */
export async function getXlsxSheetNames(file: File): Promise<string[]> {
  // For large files (>5MB), check if it's a valid XLSX before processing
  if (file.size > SIGNATURE_CHECK_THRESHOLD) {
    const headerBuf = await file.slice(0, 4).arrayBuffer();
    if (!isValidXlsxFile(headerBuf)) {
      // Not a valid XLSX/ZIP file, still try SheetJS
      const arrayBuffer = await file.arrayBuffer();
      return getSheetNamesWithSheetJS(arrayBuffer);
    }
  }

  const arrayBuffer = await file.arrayBuffer();
  const buf = new Uint8Array(arrayBuffer);

  // For very large files, use the efficient ZIP extraction first
  if (file.size > LARGE_FILE_THRESHOLD) {
    const sheetNames = extractSheetNamesFromZip(buf);
    if (sheetNames && sheetNames.length > 0) {
      return sheetNames;
    }
  }

  // For smaller files or if efficient extraction failed, use SheetJS with optimized options
  return getSheetNamesWithSheetJS(arrayBuffer);
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
  viewName: string,
): string {
  return `CREATE OR REPLACE VIEW ${viewName} AS SELECT * FROM read_xlsx(${quote(fileName, { single: true })}, sheet=${quote(sheetName, { single: true })}, ignore_errors=true);`;
}
