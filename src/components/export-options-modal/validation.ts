import { ExportFormat } from '@models/export-options';

interface ValidationState {
  filename: string;
  format: ExportFormat;
  delimiter?: string;
  quoteChar?: string;
  escapeChar?: string;
  sheetName?: string;
  tableName?: string;
  rootElement?: string;
  rowElement?: string;
}

interface ValidationErrors {
  filenameError: string;
  delimiterError: string;
  quoteCharError: string;
  escapeCharError: string;
  sheetNameError: string;
  tableNameError: string;
  rootElementError: string;
  rowElementError: string;
}

export function validateExportOptions(state: ValidationState): {
  isValid: boolean;
  errors: ValidationErrors;
} {
  let isValid = true;
  const errors: ValidationErrors = {
    filenameError: '',
    delimiterError: '',
    quoteCharError: '',
    escapeCharError: '',
    sheetNameError: '',
    tableNameError: '',
    rootElementError: '',
    rowElementError: '',
  };

  // Common validations
  if (!state.filename.trim()) {
    errors.filenameError = 'Filename is required';
    isValid = false;
  } else if (state.filename.includes('.') && state.filename.split('.').pop()?.trim() === '') {
    errors.filenameError = 'Filename must have a valid extension';
    isValid = false;
  }

  // Format-specific validations
  switch (state.format) {
    case 'csv':
      if (!state.delimiter || state.delimiter.length !== 1) {
        errors.delimiterError = 'Delimiter must be a single character';
        isValid = false;
      }
      if (!state.quoteChar || state.quoteChar.length !== 1) {
        errors.quoteCharError = 'Quote character must be a single character';
        isValid = false;
      }
      if (!state.escapeChar || state.escapeChar.length !== 1) {
        errors.escapeCharError = 'Escape character must be a single character';
        isValid = false;
      }
      break;

    case 'tsv':
      if (!state.quoteChar || state.quoteChar.length !== 1) {
        errors.quoteCharError = 'Quote character must be a single character';
        isValid = false;
      }
      if (!state.escapeChar || state.escapeChar.length !== 1) {
        errors.escapeCharError = 'Escape character must be a single character';
        isValid = false;
      }
      break;

    case 'xlsx':
      if (!state.sheetName?.trim()) {
        errors.sheetNameError = 'Sheet name is required';
        isValid = false;
      } else if (state.sheetName.length > 31) {
        errors.sheetNameError = 'Sheet name must be 31 characters or less';
        isValid = false;
      } else if (/[\\/:*?[\]]/.test(state.sheetName)) {
        errors.sheetNameError = 'Sheet name contains invalid characters';
        isValid = false;
      }
      break;

    case 'sql':
      if (!state.tableName?.trim()) {
        errors.tableNameError = 'Table name is required';
        isValid = false;
      } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(state.tableName)) {
        errors.tableNameError =
          'Invalid table name. Use only letters, numbers, and underscores. Must start with a letter or underscore.';
        isValid = false;
      }
      break;

    case 'xml':
      if (!state.rootElement?.trim()) {
        errors.rootElementError = 'Root element name is required';
        isValid = false;
      } else if (state.rootElement.toLowerCase().startsWith('xml')) {
        errors.rootElementError = 'Element names cannot start with "xml" (reserved)';
        isValid = false;
      } else if (!/^[a-zA-Z_][a-zA-Z0-9_\-.]*$/.test(state.rootElement)) {
        errors.rootElementError =
          'Invalid XML element name. Must start with letter or underscore and contain only letters, numbers, hyphens, underscores, and periods';
        isValid = false;
      }

      if (!state.rowElement?.trim()) {
        errors.rowElementError = 'Row element name is required';
        isValid = false;
      } else if (state.rowElement.toLowerCase().startsWith('xml')) {
        errors.rowElementError = 'Element names cannot start with "xml" (reserved)';
        isValid = false;
      } else if (!/^[a-zA-Z_][a-zA-Z0-9_\-.]*$/.test(state.rowElement)) {
        errors.rowElementError =
          'Invalid XML element name. Must start with letter or underscore and contain only letters, numbers, hyphens, underscores, and periods';
        isValid = false;
      }
      break;
  }

  return { isValid, errors };
}
