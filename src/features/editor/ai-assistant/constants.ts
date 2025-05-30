/**
 * Constants for AI Assistant timing and configuration
 */

export const AI_ASSISTANT_TIMINGS = {
  /** Delay for schema context updates to ensure connection pool is ready */
  SCHEMA_UPDATE_DELAY: 100,

  /** Interval for loading dots animation during AI request */
  LOADING_DOTS_INTERVAL: 500,

  /** Duration to display error messages in textarea before reset */
  ERROR_DISPLAY_DURATION: 3000,

  /** Duration for error toast notifications */
  ERROR_NOTIFICATION_DURATION: 5000,

  /** Duration for success notifications */
  SUCCESS_NOTIFICATION_DURATION: 3000,

  /** Timeout for DOM operations that need to occur after current call stack */
  NEXT_TICK_DELAY: 0,
} as const;
