import { create } from 'zustand';

interface EditorStateModel {
  saving: boolean;
  lastQueryDirty: boolean;
  editorValue: string;
  setSaving: (saving: boolean) => void;
  setLastQueryDirty: (dirty: boolean) => void;
  setEditorValue: (value: string) => void;
  getEditorValue: () => string;
}

export const useEditorStore = create<EditorStateModel>()((set, get) => ({
  saving: false,
  lastQueryDirty: false,
  editorValue: '',
  setSaving: (saving) => set({ saving }),
  setLastQueryDirty: (lastQueryDirty) => set({ lastQueryDirty }),
  setEditorValue: (editorValue) => set({ editorValue }),
  getEditorValue: () => get().editorValue,
}));
