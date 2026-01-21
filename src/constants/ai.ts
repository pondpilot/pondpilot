/**
 * AI Service Constants
 * Centralized configuration for AI providers and related settings.
 */

/**
 * Provider IDs - use these instead of string literals throughout the codebase
 */
export const PROVIDER_IDS = {
  POLLY: 'pondpilot',
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  CUSTOM: 'custom',
} as const;

export type ProviderId = (typeof PROVIDER_IDS)[keyof typeof PROVIDER_IDS];

/**
 * Polly AI configuration
 */
export const POLLY_CONFIG = {
  /** Model used by the Polly AI proxy */
  MODEL: 'claude-haiku-4-5-20251001',
  /** Maximum tokens for responses */
  MAX_TOKENS: 5000,
  /** Temperature for generation (low for deterministic SQL) */
  TEMPERATURE: 0.1,
  /** Request timeout in milliseconds */
  TIMEOUT_MS: 120000,
  /** Display name for the Polly AI service */
  DISPLAY_NAME: 'Polly AI',
} as const;

/**
 * General AI service configuration
 */
export const AI_SERVICE_CONFIG = {
  /** Maximum tokens for responses */
  MAX_TOKENS: 5000,
  /** Default temperature for generation */
  TEMPERATURE: 0.1,
  /** Request timeout in milliseconds */
  TIMEOUT_MS: 120000,
} as const;
