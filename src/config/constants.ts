// AI Service Configuration
export const AI_SERVICE = {
  // Request timeout in milliseconds
  REQUEST_TIMEOUT: 120000, // 2 minutes

  // Token limits
  MAX_CONTEXT_TOKENS: 8000,
  DEFAULT_MAX_TOKENS: 8192,

  // Retry configuration
  MAX_RETRIES: 2,
  RETRY_DELAY: 1000, // 1 second
} as const;

// Chat Configuration
export const CHAT = {
  // Result limits
  MAX_RESULT_ROWS: 100,

  // UI Configuration
  DEBOUNCE_DELAY: 150, // milliseconds

  // Message trimming
  TOKEN_ESTIMATION_RATIO: 4, // ~4 characters per token
} as const;

// Table Configuration
export const TABLE_UI = {
  // Maximum rows to display
  MAX_DISPLAY_ROWS: 1000,

  // Column widths
  DEFAULT_COLUMN_WIDTH: 150,
  MIN_COLUMN_WIDTH: 50,
  MAX_COLUMN_WIDTH: 500,
} as const;

// Editor Configuration
export const EDITOR = {
  // Autocomplete
  AUTOCOMPLETE_DEBOUNCE: 300, // milliseconds

  // Tab management
  MAX_TABS: 20,
  MAX_TAB_TITLE_LENGTH: 30,
} as const;

// File Operations
export const FILE_OPS = {
  // Size limits
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  CHUNK_SIZE: 1024 * 1024, // 1MB chunks for reading

  // Supported formats
  SUPPORTED_EXTENSIONS: ['.csv', '.tsv', '.json', '.parquet', '.xlsx', '.xls'] as const,
} as const;

// Persistence Configuration
export const PERSISTENCE = {
  // IndexedDB
  DB_VERSION: 1,
  SAVE_DEBOUNCE: 1000, // 1 second

  // OPFS
  OPFS_DIR_NAME: 'pondpilot-data',
} as const;
