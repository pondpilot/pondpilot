import { create } from 'zustand';
import { DataBaseModel, DuckDBView } from '@models/common';

interface AppStateModel {
  views: DuckDBView[];
  databases: DataBaseModel[];
  setDatabases: (v: DataBaseModel[]) => void;
  setViews: (v: DuckDBView[]) => void;
}

export const useAppStore = create<AppStateModel>()((set) => ({
  views: [],
  databases: [],
  setDatabases: (databases) => set({ databases }),
  setViews: (views) => set({ views }),
}));
