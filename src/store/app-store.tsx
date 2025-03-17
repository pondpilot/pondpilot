import { create } from 'zustand';
import { Table } from 'apache-arrow';
import { SessionFiles, TabModel } from '@features/app-context/models';
import { Limit, DataBaseModel, CodeEditor } from '@models/common';
import { SortModel } from './pagination-store';

interface CachedPaginationValue {
  rowsCount: number;
  limit: Limit;
  currentPage: number;
  sort: SortModel;
}

type AppStatus = 'initializing' | 'ready' | 'error' | 'unsupported-browser';

interface AppStateModel {
  databases: DataBaseModel[];

  queryView: boolean;
  queryRunning: boolean;
  cachedResults: Record<string, Table | null>;
  cachedPagination: Record<string, CachedPaginationValue | null>;

  views: string[];
  sessionFiles: SessionFiles | null;

  queries: CodeEditor[];
  tabs: TabModel[];
  queryResults: Table | null;
  currentView: string | null;
  currentQuery: string | null;
  activeTab: TabModel | null;
  originalQuery: string;
  appStatus: AppStatus;
  setViews: (v: string[]) => void;
  setDatabases: (v: DataBaseModel[]) => void;
  setTabs: (v: TabModel[]) => void;
  setQueryView: (v: boolean) => void;
  setCurrentView: (v: string | null) => void;
  setActiveTab: (v: TabModel | null) => void;
  setQueries: (v: CodeEditor[]) => void;
  setQueryResults: (v: Table | null) => void;
  setCurrentQuery: (v: string | null) => void;
  setOriginalQuery: (v: string) => void;
  setQueryRunning: (v: boolean) => void;
  setAppStatus: (v: AppStatus) => void;
  setCachedResults: (key: string, value: Table | null) => void;
  setCachedPagination: (key: string, value: CachedPaginationValue | null) => void;
  setSessionFiles: (v: SessionFiles | null) => void;
}

export const useAppStore = create<AppStateModel>()((set) => ({
  views: [],
  databases: [],
  queries: [],
  sessionFiles: null,

  tabs: [],
  cachedResults: {},
  cachedPagination: {},
  queryView: false,
  queryRunning: false,
  originalQuery: '',
  appStatus: 'initializing',
  queryResults: null,
  currentView: null,
  currentQuery: null,
  activeTab: null,
  setActiveTab: (activeTab) => set({ activeTab }),
  setDatabases: (databases) => set({ databases }),
  setCurrentView: (currentView) => set({ currentView }),
  setViews: (views) => set({ views }),
  setTabs: (tabs) => set({ tabs }),
  setQueryView: (queryView) => set({ queryView }),
  setQueries: (queries) => set({ queries }),
  setQueryResults: (queryResults) => set({ queryResults }),
  setCurrentQuery: (currentQuery) => set({ currentQuery }),
  setOriginalQuery: (originalQuery) => set({ originalQuery }),
  setQueryRunning: (queryRunning) => set({ queryRunning }),
  setAppStatus: (appStatus) => set({ appStatus }),
  setSessionFiles: (sessionFiles) => set({ sessionFiles }),
  setCachedResults: (key, value) =>
    set((state) => ({
      cachedResults: {
        ...state.cachedResults,
        [key]: value,
      },
    })),
  setCachedPagination: (key, value) =>
    set((state) => ({
      cachedPagination: {
        ...state.cachedPagination,
        [key]: value,
      },
    })),
}));
