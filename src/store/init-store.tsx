import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

type AppLoadState = 'init' | 'ready' | 'error';

// A small store to manage the state before the "heavy" parts of the app are loaded.
type InitStore = {
  appLoadState: AppLoadState;
};

export const useInitStore = create<InitStore>()(
  devtools(
    () => ({
      appLoadState: 'init',
    }),
    { name: 'InitStore' },
  ),
);

export const setAppLoadState = (status: AppLoadState) => {
  useInitStore.setState({ appLoadState: status }, undefined, 'InitStore/setAppLoadState');
};
