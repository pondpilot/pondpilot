/**
 * Editor preferences stored in localStorage
 */

export type LintSeverityFilter = 'errors' | 'errors-warnings' | 'all';

export interface EditorPreferences {
  formatOnRun: boolean;
  fontSize: number;
  fontWeight: 'light' | 'regular' | 'semibold' | 'bold';
  minimap: boolean;
  lintEnabled: boolean;
  lintSeverityFilter: LintSeverityFilter;
  lintDisabledRules: string[];
}

const EDITOR_PREFERENCES_KEY = 'pondpilot-editor-preferences';

const defaultPreferences: EditorPreferences = {
  formatOnRun: false,
  fontSize: 0.875,
  fontWeight: 'regular',
  minimap: false,
  lintEnabled: true,
  lintSeverityFilter: 'all',
  // AM_004 (ambiguous column reference) is noisy for exploratory queries; disabled by default
  lintDisabledRules: ['LINT_AM_004'],
};

/**
 * Get editor preferences from localStorage
 */
export function getEditorPreferences(): EditorPreferences {
  try {
    const stored = localStorage.getItem(EDITOR_PREFERENCES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle missing fields
      return { ...defaultPreferences, ...parsed };
    }
  } catch (error) {
    console.error('Failed to load editor preferences:', error);
  }
  return defaultPreferences;
}

/**
 * Save editor preferences to localStorage
 */
export function saveEditorPreferences(preferences: Partial<EditorPreferences>): void {
  try {
    const current = getEditorPreferences();
    const updated = { ...current, ...preferences };
    localStorage.setItem(EDITOR_PREFERENCES_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save editor preferences:', error);
  }
}

/**
 * Custom event name for same-tab preference updates
 */
export const EDITOR_PREFERENCES_CHANGE_EVENT = 'pondpilot-editor-preferences-change';

/**
 * Update a single preference
 */
export function updateEditorPreference<K extends keyof EditorPreferences>(
  key: K,
  value: EditorPreferences[K],
): void {
  saveEditorPreferences({ [key]: value });
  // Dispatch custom event to notify other components in the same tab
  window.dispatchEvent(new CustomEvent(EDITOR_PREFERENCES_CHANGE_EVENT));
}

/**
 * Reset editor preferences to defaults
 */
export function resetEditorPreferences(): void {
  try {
    localStorage.removeItem(EDITOR_PREFERENCES_KEY);
  } catch (error) {
    console.error('Failed to reset editor preferences:', error);
  }
}
