import { create } from 'zustand';
import { DataBaseModel, DuckDBView } from '@models/common';

type AppStatus = 'initializing' | 'ready' | 'error' | 'unsupported-browser';

interface AppStateModel {
  views: DuckDBView[];
  databases: DataBaseModel[];
  appStatus: AppStatus;
  setDatabases: (v: DataBaseModel[]) => void;
  setViews: (v: DuckDBView[]) => void;
  setAppStatus: (v: AppStatus) => void;
}

export const useAppStore = create<AppStateModel>()((set) => ({
  views: [],
  databases: [],
  appStatus: 'initializing',
  setDatabases: (databases) => set({ databases }),
  setViews: (views) => set({ views }),
  setAppStatus: (appStatus) => set({ appStatus }),
}));
