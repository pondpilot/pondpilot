/**
 * Maximum length for chart labels to prevent layout issues.
 */
const MAX_LABEL_LENGTH = 100;

/**
 * Sanitizes and validates a chart label string.
 * - Trims whitespace
 * - Limits length to prevent layout issues
 * - Removes control characters
 *
 * @param label - The label to sanitize (can be null)
 * @returns Sanitized label or null if input was null/empty
 */
export function sanitizeChartLabel(label: string | null): string | null {
  if (label === null || label === undefined) {
    return null;
  }

  // Trim whitespace
  let sanitized = label.trim();

  // Return null for empty strings
  if (sanitized.length === 0) {
    return null;
  }

  // Remove control characters (but keep newlines and tabs for multi-line labels)
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Truncate if too long
  if (sanitized.length > MAX_LABEL_LENGTH) {
    sanitized = `${sanitized.substring(0, MAX_LABEL_LENGTH - 3)}...`;
  }

  return sanitized;
}
