import { create } from 'zustand';
import { Limit } from 'models/table';

export interface SortModel {
  field: string | null;
  direction: 'asc' | 'desc' | null;
}

interface PaginationStateModel {
  rowsCount: number;
  limit: Limit;
  currentPage: number;
  sort: SortModel;
  setSort: (sort: SortModel) => void;
  setLimit: (count: Limit) => void;
  setRowsCount: (count: number) => void;
  setCurrentPage: (page: number) => void;
  resetPagination: () => void; // Новая функция сброса к начальному состоянию
}

export const usePaginationStore = create<PaginationStateModel>()((set) => ({
  rowsCount: 0,
  limit: 100,
  currentPage: 1,
  sort: { field: null, direction: null },
  setSort: (sort) => set({ sort }),
  setLimit: (limit) => set({ limit }),
  setRowsCount: (rowsCount) => set({ rowsCount }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  resetPagination: () =>
    set({ rowsCount: 0, limit: 100, currentPage: 1, sort: { field: null, direction: null } }),
}));
