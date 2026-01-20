/**
 * Constants for version history feature timing and configuration.
 */

/** Minimum time between auto-save versions in milliseconds */
export const MIN_VERSION_INTERVAL_MS = 1000;

/** Debounce delay for editor content save in milliseconds */
export const EDITOR_SAVE_DEBOUNCE_MS = 300;

/** Alert display durations in milliseconds */
export const ALERT_TIMING = {
  /** Short alerts (success messages) */
  SHORT: 2000,
  /** Medium alerts (version saved, restored) */
  MEDIUM: 3000,
  /** Long alerts (warnings, errors) */
  LONG: 5000,
} as const;
