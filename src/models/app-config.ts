/**
 * Application configuration helpers (frontend-only)
 */

const QUERY_TIMEOUT_KEY = 'pondpilot-query-timeout-ms';

/**
 * Get the query execution timeout in milliseconds.
 * Falls back to 30000 (30s) if not set or invalid.
 */
export function getQueryTimeoutMs(): number {
  try {
    const raw = localStorage.getItem(QUERY_TIMEOUT_KEY);
    if (!raw) return 30000;
    const value = parseInt(raw, 10);
    if (Number.isFinite(value) && value > 0 && value < 10 * 60 * 1000) {
      return value;
    }
  } catch {
    // ignore
  }
  return 30000;
}

/**
 * Set the query execution timeout in milliseconds.
 */
export function setQueryTimeoutMs(value: number): void {
  try {
    localStorage.setItem(QUERY_TIMEOUT_KEY, String(value));
  } catch {
    // ignore
  }
}
