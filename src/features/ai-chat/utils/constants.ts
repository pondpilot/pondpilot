import { AI_SERVICE, CHAT } from '../../../config/constants';

export const { MAX_RESULT_ROWS } = CHAT;
export const AI_MODEL_CONTEXT_LIMIT = AI_SERVICE.MAX_CONTEXT_TOKENS; // Conservative limit for context management
export const MAX_CONTEXT_ROWS = 10; // Maximum rows to include in AI context
export const MAX_CONTEXT_CHARS_PER_CELL = 100; // Maximum characters per cell in context
