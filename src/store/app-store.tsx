import { DataBaseModel } from '@models/db';
import { create } from 'zustand';

interface AppStateModel {
  databases: DataBaseModel[];
  setDatabases: (v: DataBaseModel[]) => void;
}

export const useAppStore = create<AppStateModel>()((set) => ({
  databases: [],
  setDatabases: (databases) => set({ databases }),
}));
