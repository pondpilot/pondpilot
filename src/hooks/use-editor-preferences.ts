import {
  EditorPreferences,
  getEditorPreferences,
  updateEditorPreference,
  EDITOR_PREFERENCES_CHANGE_EVENT,
} from '@store/editor-preferences';
import { useState, useCallback, useEffect } from 'react';

/**
 * Hook to manage editor preferences with localStorage persistence
 */
export function useEditorPreferences() {
  const [preferences, setPreferences] = useState<EditorPreferences>(getEditorPreferences);

  // Listen for storage changes from other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'pondpilot-editor-preferences') {
        setPreferences(getEditorPreferences());
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Listen for preference changes within the same tab
  useEffect(() => {
    const handlePreferenceChange = () => {
      setPreferences(getEditorPreferences());
    };

    window.addEventListener(EDITOR_PREFERENCES_CHANGE_EVENT, handlePreferenceChange);
    return () =>
      window.removeEventListener(EDITOR_PREFERENCES_CHANGE_EVENT, handlePreferenceChange);
  }, []);

  const updatePreference = useCallback(
    <K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]) => {
      updateEditorPreference(key, value);
      setPreferences((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  return {
    preferences,
    updatePreference,
  };
}
