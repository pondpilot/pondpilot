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

  /** Maximum number of suggestions to display in dropdown */
  MAX_SUGGESTIONS: 15,

  /** Maximum height of the dropdown in pixels */
  DROPDOWN_MAX_HEIGHT: 200,

  /** Height of each suggestion item in pixels */
  ITEM_HEIGHT: 40,

  /** Cache TTL for database model in milliseconds */
  DATABASE_CACHE_TTL_MS: 30000,
} as const;

export const FUZZY_SCORE = {
  /** Score for exact match */
  EXACT_MATCH: 1000,

  /** Base score for prefix match */
  PREFIX_MATCH_BASE: 900,

  /** Base score for contains match */
  CONTAINS_MATCH_BASE: 700,

  /** Score for each character match */
  CHAR_MATCH: 100,

  /** Bonus for consecutive character matches */
  CONSECUTIVE_BONUS: 50,

  /** Bonus for matches at word boundaries */
  WORD_BOUNDARY_BONUS: 30,

  /** Penalty per position from start */
  POSITION_PENALTY: 10,

  /** Penalty per character length difference */
  LENGTH_PENALTY: 2,
} as const;

export const UI_SELECTORS = {
  // Base widget classes
  CONTAINER: '.ai-widget-container',
  CLOSE_BUTTON: '.ai-widget-close',
  FOOTER: '.ai-widget-footer',
  SPACER: '.ai-widget-spacer',
  HINT: '.ai-widget-hint',

  // Input section classes
  INPUT_SECTION: '.ai-widget-input-section',
  TEXTAREA: '.ai-widget-textarea',
  GENERATE_BUTTON: '.ai-widget-generate',
  LOADING: 'ai-widget-loading',

  // Context section classes
  CONTEXT: '.ai-widget-context',
  CONTEXT_LABEL: '.ai-widget-context-label',
  CONTEXT_CODE: '.ai-widget-context-code',
  SCHEMA_CONTEXT: '.ai-widget-schema-context',
  SCHEMA_CONTEXT_LABEL: '.ai-widget-schema-context-label',
  SCHEMA_INDICATOR: '.ai-widget-schema-indicator',
  COMBINED_CONTEXT: '.ai-widget-combined-context',
  CONTEXT_HEADER: '.ai-widget-context-header',
  CONTEXT_LEFT: '.ai-widget-context-left',
  CONTEXT_TOGGLE: '.ai-widget-context-toggle',
  CONTEXT_HEADER_LABEL: '.ai-widget-context-header-label',
  CONTEXT_CONTENT: '.ai-widget-context-content',
  CONTEXT_SUBSECTION: '.ai-widget-context-subsection',

  // Mention dropdown classes
  MENTION_DROPDOWN: '.ai-widget-mention-dropdown',
  MENTION_ITEM: '.ai-widget-mention-item',
  MENTION_ITEM_SELECTED: '.ai-widget-mention-item.selected',
  MENTION_LABEL: '.ai-widget-mention-label',
  MENTION_CONTEXT: '.ai-widget-mention-context',

  // Response section classes
  RESPONSE_SECTION: '.ai-widget-response-section',
  RESPONSE_OUTPUT: '.ai-widget-response-output',
  RESPONSE_HEADER: '.ai-widget-response-header',
  RESPONSE_CONTENT: '.ai-widget-response-content',
  RESPONSE_ACTIONS: '.ai-widget-response-actions',
  RESPONSE_ERROR: '.ai-widget-response-error',
  RESPONSE_INSERT_BUTTON: '.ai-widget-insert-button',
  RESPONSE_REPLACE_BUTTON: '.ai-widget-replace-button',

  // State classes (without dots, for classList operations)
  EXPANDED: 'expanded',
  SELECTED: 'selected',
  ERROR: 'error',
  HIDDEN: 'hidden',
} as const;
