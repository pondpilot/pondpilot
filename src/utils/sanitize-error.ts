/**
 * Sanitizes error messages to prevent leaking credentials that may have
 * been embedded in SQL statements (e.g. CREATE SECRET).
 */

/** Patterns that match credential-like key-value pairs in error messages. */
const CREDENTIAL_PATTERNS = [
  // KEY 'value' or KEY "value" for sensitive keys
  /\b(CLIENT_SECRET|TOKEN|SECRET|KEY_ID|CLIENT_ID)\s+['"][^'"]*['"]/gi,
  // Full CREATE SECRET ... (...) blocks
  /CREATE\s+(?:OR\s+REPLACE\s+)?SECRET\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"[^"]+"|[\w]+)\s*\([^)]*\)/gi,
];

export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  for (const pattern of CREDENTIAL_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      // Keep the key name but redact the value
      const keyMatch = match.match(/^(\w+)\s+/);
      if (keyMatch) {
        return `${keyMatch[1]} [REDACTED]`;
      }
      return '[REDACTED]';
    });
  }
  return sanitized;
}
