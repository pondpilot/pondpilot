import { nanoid } from 'nanoid';

import { PROMPT_HISTORY } from './constants';
import { sanitizeForStorage } from './utils/sanitization';

// Types
export interface PromptHistoryItem {
  id: string;
  prompt: string;
  timestamp: number;
}

export interface PromptHistoryManager {
  addPrompt: (prompt: string) => void;
  getHistory: () => PromptHistoryItem[];
  clearHistory: () => void;
  getPromptAtIndex: (index: number) => string | null;
}

// Storage helpers
function loadHistoryFromStorage(): PromptHistoryItem[] {
  try {
    const stored = localStorage.getItem(PROMPT_HISTORY.STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    // Validate and filter items
    return parsed
      .filter(
        (item): item is PromptHistoryItem =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.id === 'string' &&
          typeof item.prompt === 'string' &&
          typeof item.timestamp === 'number',
      )
      .slice(0, PROMPT_HISTORY.MAX_ITEMS);
  } catch (error) {
    console.error('Failed to load prompt history:', error);
    return [];
  }
}

function saveHistoryToStorage(items: PromptHistoryItem[]): void {
  try {
    localStorage.setItem(PROMPT_HISTORY.STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('Failed to save prompt history:', error);
    // Continue operating with in-memory history
  }
}

export function createPromptHistoryManager(): PromptHistoryManager {
  let historyItems = loadHistoryFromStorage();

  return {
    addPrompt(prompt: string): void {
      // Skip empty prompts
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) return;

      // Truncate if too long
      const truncatedPrompt = trimmedPrompt.slice(0, PROMPT_HISTORY.MAX_PROMPT_LENGTH);

      // Sanitize prompt before storage
      const sanitizedPrompt = sanitizeForStorage(truncatedPrompt);

      // Check for duplicates
      const existingIndex = historyItems.findIndex((item) => item.prompt === sanitizedPrompt);

      if (existingIndex !== -1) {
        // Move existing item to the front
        const [existingItem] = historyItems.splice(existingIndex, 1);
        existingItem.timestamp = Date.now();
        historyItems.unshift(existingItem);
      } else {
        // Add new item at the beginning
        const newItem: PromptHistoryItem = {
          id: nanoid(),
          prompt: sanitizedPrompt,
          timestamp: Date.now(),
        };
        historyItems.unshift(newItem);

        // Maintain max items limit
        if (historyItems.length > PROMPT_HISTORY.MAX_ITEMS) {
          historyItems = historyItems.slice(0, PROMPT_HISTORY.MAX_ITEMS);
        }
      }

      // Persist to storage
      saveHistoryToStorage(historyItems);
    },

    getHistory(): PromptHistoryItem[] {
      return [...historyItems]; // Return a copy
    },

    clearHistory(): void {
      historyItems = [];
      try {
        localStorage.removeItem(PROMPT_HISTORY.STORAGE_KEY);
      } catch (error) {
        console.error('Failed to clear prompt history:', error);
      }
    },

    getPromptAtIndex(index: number): string | null {
      if (index < 0 || index >= historyItems.length) {
        return null;
      }
      return historyItems[index].prompt;
    },
  };
}

// Singleton instance
let historyManagerInstance: PromptHistoryManager | null = null;

export function getPromptHistoryManager(): PromptHistoryManager {
  if (!historyManagerInstance) {
    historyManagerInstance = createPromptHistoryManager();
  }
  return historyManagerInstance;
}
