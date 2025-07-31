import {
  EditorPreferences,
  getEditorPreferences,
  updateEditorPreference,
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
