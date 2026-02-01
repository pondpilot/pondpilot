/**
 * Sanitizes error messages to prevent leaking credentials that may have
 * been embedded in SQL statements (e.g. CREATE SECRET).
 *
 * Strategy: apply two layers of redaction.
 * 1. Blanket — redact the entire body of CREATE SECRET (...) blocks.
 *    This catches everything regardless of internal formatting or
 *    SQL comments that might break finer-grained patterns.
 * 2. Keyword — redact any remaining credential-like key-value pairs
 *    that appear outside a CREATE SECRET block (e.g. standalone
 *    error messages from DuckDB that echo back individual options).
 */

/** Blanket: redact everything inside CREATE SECRET parentheses. */
const CREATE_SECRET_BLANKET =
  /(CREATE\s+(?:OR\s+REPLACE\s+)?(?:PERSISTENT\s+)?(?:TEMPORARY\s+)?SECRET\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"[^"]+"|[\w]+)\s*\()[^)]*(\))/gi;

/** Keyword: individual credential key-value pairs. */
const CREDENTIAL_KEY_PATTERNS =
  /\b(CLIENT_SECRET|TOKEN|SECRET|KEY_ID|CLIENT_ID|PASSWORD|API_KEY|ACCESS_TOKEN|REFRESH_TOKEN)\s+['"][^'"]*['"]/gi;

export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;

  // Layer 1: redact everything inside CREATE SECRET (...)
  sanitized = sanitized.replace(CREATE_SECRET_BLANKET, '$1[REDACTED]$2');

  // Layer 2: catch stray credential values outside CREATE SECRET blocks
  sanitized = sanitized.replace(CREDENTIAL_KEY_PATTERNS, (match) => {
    const keyMatch = match.match(/^(\w+)\s+/);
    if (keyMatch) {
      return `${keyMatch[1]} [REDACTED]`;
    }
    return '[REDACTED]';
  });

  return sanitized;
}
