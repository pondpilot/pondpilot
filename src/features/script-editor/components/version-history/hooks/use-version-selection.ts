import { ScriptVersion } from '@models/script-version';
import { useCallback, useState } from 'react';

export type SelectionMode = 'preview' | 'compare';

export interface VersionSelectionState {
  mode: SelectionMode;
  selectedVersion: ScriptVersion | null;
  compareVersion: ScriptVersion | null;
}

export interface UseVersionSelectionReturn {
  state: VersionSelectionState;
  selectVersion: (version: ScriptVersion) => void;
  toggleCompareMode: () => void;
  clearSelection: () => void;
  isVersionSelected: (version: ScriptVersion) => boolean;
  isVersionCompareTarget: (version: ScriptVersion) => boolean;
  syncWithVersions: (versions: ScriptVersion[]) => void;
}

const initialState: VersionSelectionState = {
  mode: 'preview',
  selectedVersion: null,
  compareVersion: null,
};

export const useVersionSelection = (): UseVersionSelectionReturn => {
  const [state, setState] = useState<VersionSelectionState>(initialState);

  const selectVersion = useCallback((version: ScriptVersion) => {
    setState((prev) => {
      if (prev.mode === 'preview') {
        return {
          ...prev,
          selectedVersion: version,
        };
      }

      // In compare mode, handle multi-selection
      if (!prev.selectedVersion) {
        return {
          ...prev,
          selectedVersion: version,
        };
      }

      if (prev.selectedVersion.id === version.id) {
        // Deselect if clicking the same version
        return {
          ...prev,
          selectedVersion: prev.compareVersion,
          compareVersion: null,
        };
      }

      if (prev.compareVersion?.id === version.id) {
        // Deselect compare version
        return {
          ...prev,
          compareVersion: null,
        };
      }

      // Set as compare version
      return {
        ...prev,
        compareVersion: version,
      };
    });
  }, []);

  const toggleCompareMode = useCallback(() => {
    setState((prev) => ({
      ...prev,
      mode: prev.mode === 'preview' ? 'compare' : 'preview',
      compareVersion: null, // Clear compare version when switching modes
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setState(initialState);
  }, []);

  const isVersionSelected = useCallback(
    (version: ScriptVersion) => {
      return state.selectedVersion?.id === version.id;
    },
    [state.selectedVersion],
  );

  const isVersionCompareTarget = useCallback(
    (version: ScriptVersion) => {
      return state.compareVersion?.id === version.id;
    },
    [state.compareVersion],
  );

  // Sync selection state with updated versions list (e.g., after rename)
  const syncWithVersions = useCallback((versions: ScriptVersion[]) => {
    setState((prev) => {
      const updatedSelected = prev.selectedVersion
        ? (versions.find((v) => v.id === prev.selectedVersion!.id) ?? null)
        : null;
      const updatedCompare = prev.compareVersion
        ? (versions.find((v) => v.id === prev.compareVersion!.id) ?? null)
        : null;

      // Only update if something changed
      if (updatedSelected === prev.selectedVersion && updatedCompare === prev.compareVersion) {
        return prev;
      }

      return {
        ...prev,
        selectedVersion: updatedSelected,
        compareVersion: updatedCompare,
      };
    });
  }, []);

  return {
    state,
    selectVersion,
    toggleCompareMode,
    clearSelection,
    isVersionSelected,
    isVersionCompareTarget,
    syncWithVersions,
  };
};
