/**
 * Sanitizes error messages to prevent leaking internal implementation details.
 * Removes sensitive information like API keys, internal paths, and stack traces.
 */
export function sanitizeErrorMessage(message: string): string {
  return (
    message
      // Remove potential API keys or tokens (Bearer, sk-, key patterns)
      .replace(/bearer\s+[\w-]+/gi, 'bearer [REDACTED]')
      // Match sk- followed by alphanumeric chars and dashes (OpenAI key format)
      .replace(/sk-[a-zA-Z0-9-]+/gi, '[REDACTED]')
      .replace(/x-api-key[:\s]+[\w-]+/gi, 'x-api-key [REDACTED]')
      // Remove potential file paths (tsx/jsx before ts/js to match longer extensions first)
      .replace(/\/[\w/.-]+\.(tsx|jsx|ts|js)/gi, '[path]')
      // Remove stack traces
      .replace(/\s+at\s+[\w.<>]+\s+\([^)]+\)/g, '')
      // Limit length to prevent verbose internal errors
      .slice(0, 500)
  );
}
