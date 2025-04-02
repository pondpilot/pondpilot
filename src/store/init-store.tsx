import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

type AppState = 'init' | 'ready' | 'error';

// A small store to manage the state before the "heavy" parts of the app are loaded.
type InitStore = {
  appState: AppState;
};

export const useInitStore = create<InitStore>()(
  devtools(
    () => ({
      appState: 'init',
    }),
    { name: 'InitStore' },
  ),
);

export const setAppState = (status: AppState) => {
  useInitStore.setState({ appState: status }, undefined, 'InitStore/setAppState');
};
