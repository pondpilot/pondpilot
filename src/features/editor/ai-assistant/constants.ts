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

export const PROMPT_HISTORY = {
  /** Maximum number of prompts to store in history */
  MAX_ITEMS: 50,

  /** Maximum length of a single prompt in characters */
  MAX_PROMPT_LENGTH: 1000,

  /** LocalStorage key for prompt history */
  STORAGE_KEY: 'pondpilot.ai-prompt-history',
} as const;

export const DATABASE_LIMITS = {
  /** Threshold for showing warning about large databases */
  LARGE_DB_THRESHOLD: 5000,
  /** Maximum cache size in MB for database model */
  MAX_CACHE_SIZE_MB: 50,
} as const;

export const MENTION_AUTOCOMPLETE = {
  /** Debounce delay for mention search requests in milliseconds */
  DEBOUNCE_DELAY_MS: 150,
} as const;
