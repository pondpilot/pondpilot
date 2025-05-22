import { NormalizedSQLType } from '@models/db';
import DOMPurify from 'dompurify';

import {
  NUMERIC_COLUMN_TYPES,
  MAX_SAFE_INTEGER_DISPLAY,
  MIN_SAFE_INTEGER_DISPLAY,
  MAX_CHART_VALUE,
  MIN_CHART_VALUE,
  MAX_SAFE_DECIMAL_PLACES,
} from '../constants';
import { DataValue, ColumnMetadata } from '../model';

/**
 * Checks if a column type is numeric based on SQL type names
 * @param columnType - The SQL column type string
 * @returns true if the column type is numeric
 */
export function isNumericColumnType(columnType: string): boolean {
  if (!columnType || typeof columnType !== 'string') {
    return false;
  }

  return NUMERIC_COLUMN_TYPES.map((type) => type.toLowerCase()).includes(columnType.toLowerCase());
}

/**
 * Checks if a column type is boolean based on SQL type names
 * @param columnType - The SQL column type string
 * @returns true if the column type is boolean
 */
export function isBooleanColumnType(columnType: string): boolean {
  if (!columnType || typeof columnType !== 'string') {
    return false;
  }

  return columnType.toLowerCase() === 'boolean';
}

/**
 * Checks if a column type is date/time based on SQL type names
 * @param columnType - The SQL column type string
 * @returns true if the column type is date/time
 */
export function isDateColumnType(columnType: string): boolean {
  if (!columnType || typeof columnType !== 'string') {
    return false;
  }

  const dateTypes = ['date', 'time', 'timestamp', 'datetime', 'timestamptz'];
  return dateTypes.some((type) => columnType.toLowerCase().includes(type));
}

/**
 * Checks if a column type should show frequency histogram
 * @param columnType - The SQL column type string
 * @returns true if the column should show frequency histogram
 */
export function shouldShowHistogram(columnType: string): boolean {
  return (
    isNumericColumnType(columnType) ||
    isBooleanColumnType(columnType) ||
    isDateColumnType(columnType)
  );
}

/**
 * Validates and converts a value to a number for numeric columns with overflow protection
 * @param value - The value to convert
 * @returns number if valid and within safe bounds, null if invalid or unsafe
 */
export function parseNumericValue(value: DataValue): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numValue = Number(value);
  if (Number.isNaN(numValue) || !Number.isFinite(numValue)) {
    return null;
  }

  // Protect against unsafe integers and extremely large numbers
  if (numValue > MAX_SAFE_INTEGER_DISPLAY || numValue < MIN_SAFE_INTEGER_DISPLAY) {
    console.warn('Numeric value exceeds safe display limits:', numValue);
    return null;
  }

  return numValue;
}

/**
 * Validates and converts a date/time value to a number (timestamp) for histogram generation
 * @param value - The value to convert
 * @returns timestamp in milliseconds if valid, null if invalid
 */
export function parseDateValue(value: DataValue): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    // Try to parse as Date
    const dateValue = new Date(String(value));

    // Check if the date is valid
    if (Number.isNaN(dateValue.getTime())) {
      return null;
    }

    return dateValue.getTime();
  } catch (error) {
    return null;
  }
}

/**
 * Safely formats a numeric value for chart display with overflow protection
 * @param value - The numeric value to format
 * @returns formatted string or null if value is unsafe for charts
 */
export function safeFormatChartValue(value: number): string | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  // Clamp values to safe chart rendering bounds
  if (value > MAX_CHART_VALUE || value < MIN_CHART_VALUE) {
    console.warn('Chart value exceeds safe rendering limits:', value);
    return null;
  }

  // Format with reasonable precision
  if (Number.isInteger(value)) {
    return value.toString();
  }

  // Limit decimal places to prevent UI overflow
  return value.toFixed(Math.min(MAX_SAFE_DECIMAL_PLACES, 2));
}

/**
 * Safely displays a numeric value with proper formatting and overflow protection
 * @param value - The value to display
 * @returns formatted string safe for display
 */
export function safeDisplayNumericValue(value: DataValue): string {
  const numValue = parseNumericValue(value);
  if (numValue === null) {
    return sanitizeDisplayValue(value);
  }

  const formatted = safeFormatChartValue(numValue);
  return formatted ?? 'Value too large';
}

/**
 * Sanitizes a value for safe display in the UI using DOMPurify
 * @param value - The value to sanitize
 * @returns sanitized string safe for display
 */
export function sanitizeDisplayValue(value: DataValue): string {
  if (value === null || value === undefined) {
    return '';
  }

  try {
    const stringVal = String(value);

    // Use DOMPurify for robust HTML sanitization
    // Configure to return text content only, removing all HTML tags and attributes
    const sanitized = DOMPurify.sanitize(stringVal, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
    });

    return sanitized;
  } catch (error) {
    console.warn('Error sanitizing display value:', error);
    return '';
  }
}

/**
 * Sanitizes a column name for safe display and prevents injection attacks
 * @param columnName - The column name to sanitize
 * @returns sanitized column name safe for display and use as keys
 */
export function sanitizeColumnName(columnName: string): string {
  if (!columnName || typeof columnName !== 'string') {
    return 'unknown_column';
  }

  try {
    // Use DOMPurify to remove any HTML/script content
    const sanitized = DOMPurify.sanitize(columnName, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
    });

    // Additional safety: ensure the result is a valid identifier-like string
    // Remove any remaining special characters that could cause issues
    const cleaned = sanitized
      .trim()
      .replace(/[^\w\s-_.]/g, '') // Keep only word chars, spaces, hyphens, underscores, dots
      .substring(0, 255); // Limit length to prevent DoS

    return cleaned || 'sanitized_column';
  } catch (error) {
    console.warn('Error sanitizing column name:', error);
    return 'error_column';
  }
}

/**
 * Sanitizes all user inputs in a metadata object
 * @param metadata - The metadata object to sanitize
 * @returns sanitized metadata object
 */
export function sanitizeMetadataInputs(metadata: ColumnMetadata): ColumnMetadata {
  if (!metadata || typeof metadata !== 'object') {
    return metadata;
  }

  try {
    const sanitized: ColumnMetadata = { ...metadata };

    // Sanitize column name if present
    if (sanitized.name) {
      sanitized.name = sanitizeColumnName(sanitized.name);
    }

    // Sanitize any string values in the metadata
    if (sanitized.type && typeof sanitized.type === 'string') {
      sanitized.type = sanitizeDisplayValue(sanitized.type);
    }

    // Sanitize frequency distribution keys and values
    if (sanitized.frequencyDistribution && typeof sanitized.frequencyDistribution === 'object') {
      const sanitizedFreq: Record<string, number> = {};
      for (const [key, value] of Object.entries(sanitized.frequencyDistribution)) {
        const sanitizedKey = sanitizeDisplayValue(key);
        const numValue = typeof value === 'number' ? value : 0;
        sanitizedFreq[sanitizedKey] = numValue;
      }
      sanitized.frequencyDistribution = sanitizedFreq;
    }

    return sanitized;
  } catch (error) {
    console.warn('Error sanitizing metadata inputs:', error);
    return metadata;
  }
}

/**
 * Creates user-friendly error messages that don't expose implementation details
 * @param error - The error to convert
 * @returns safe error message for display
 */
export function createUserFriendlyErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Don't expose implementation details in production
    if (process.env.NODE_ENV === 'production') {
      return 'An error occurred while processing the data';
    }
    return error.message;
  }

  return 'An unexpected error occurred';
}

/**
 * Converts a string type to NormalizedSQLType for safe usage with icon utilities
 * @param columnType - The column type string
 * @returns normalized SQL type
 */
export function normalizeColumnType(columnType: string): NormalizedSQLType {
  if (!columnType || typeof columnType !== 'string') {
    return 'other';
  }

  const lowerType = columnType.toLowerCase();

  // Map common SQL types to normalized types
  if (NUMERIC_COLUMN_TYPES.some((t) => t.toLowerCase() === lowerType)) {
    if (lowerType.includes('bigint')) return 'bigint';
    if (lowerType.includes('decimal') || lowerType.includes('numeric')) return 'decimal';
    if (lowerType.includes('float') || lowerType.includes('double') || lowerType.includes('real'))
      return 'float';
    return 'integer';
  }

  if (lowerType === 'boolean' || lowerType === 'bool') return 'boolean';
  if (lowerType.includes('date')) return 'date';
  if (lowerType.includes('timestamp')) {
    return lowerType.includes('tz') ? 'timestamptz' : 'timestamp';
  }
  if (lowerType.includes('time')) {
    return lowerType.includes('tz') ? 'timetz' : 'time';
  }
  if (lowerType.includes('interval')) return 'interval';
  if (
    lowerType.includes('string') ||
    lowerType.includes('text') ||
    lowerType.includes('varchar') ||
    lowerType.includes('char')
  )
    return 'string';
  if (lowerType.includes('bytes') || lowerType.includes('binary') || lowerType.includes('blob'))
    return 'bytes';
  if (lowerType.includes('bit')) return 'bitstring';
  if (lowerType.includes('array') || lowerType.includes('list')) return 'array';
  if (lowerType.includes('object') || lowerType.includes('struct') || lowerType.includes('json'))
    return 'object';

  return 'other';
}
